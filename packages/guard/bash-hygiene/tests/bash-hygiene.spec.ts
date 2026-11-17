import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import * as BashHygiene from '@deepseek-ai/dsh-bash-hygiene'
import type { Config } from '@deepseek-ai/dsh-bash-hygiene'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

/**
 * Behavior suite for the foreground bash hygiene guard: sleep-polling denial,
 * full-suite pytest denial, the escapes (background calls, quoted data,
 * selective pytest, other tools), config switches, and the deny reaching the
 * model as an error result — all through a real agent loop with a scripted
 * mock adapter and a `bash` stand-in that records dispatches.
 */

/** Boot the spine + the guard, with a `bash` fixture recording every dispatch. */
async function harness(config: Config = {}): Promise<{ ctx: Context; dispatched: object[] }> {
  const ctx = new Context()
  const dispatched: object[] = []
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.tools.register(defineContentToolFixture({
    name: 'bash',
    description: 'b',
    parameters: { command: { type: 'string', required: true }, run_in_background: { type: 'boolean' } },
    async execute(args) {
      dispatched.push(args)
      return [{ type: 'text', text: 'ok' }]
    },
  }))
  await ctx.plugin(BashHygiene, config)
  return { ctx, dispatched }
}

function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => { const d = ctx.on('agent/status', ({ agent: s, status: st }) => { if (s === agent && st === 'idle') { d(); resolve() } }) })
}

/** Script each command as one bash call in a single turn, then settle. */
async function runBash(ctx: Context, session: string, ...commands: object[]): Promise<Agent> {
  const adapter = new MockAdapter([
    ...commands.map((command, i) => toolCallResponse(`c${i}`, 'bash', command)),
    textResponse('done'),
  ])
  ctx.llm.registerAdapter([session], adapter)
  const agent = await ctx.agentLoop.create(SessionId(session), { provider: session, model: session })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
  await waitForIdle(ctx, agent)
  return agent
}

/** The tool results recorded for the agent's single bash call. */
function toolResults(agent: Agent): { isError: boolean; text: string }[] {
  return agent.session.snapshotEvents()
    .filter((e): e is SessionEvent<'tool/result'> => e.type === 'tool/result')
    .map(e => ({
      isError: e.data.message.isError,
      text: e.data.message.content.map(b => b.type === 'text' ? b.text : '').join(''),
    }))
}

describe('sleep polling ban', () => {
  it('denies a foreground sleep and never dispatches the command', async () => {
    const { ctx, dispatched } = await harness()
    const agent = await runBash(ctx, 'a1', { command: 'sleep 30; echo ready' })
    expect(dispatched).toHaveLength(0)
    const results = toolResults(agent)
    expect(results).toHaveLength(1)
    expect(results[0]!.isError).toBe(true)
    expect(results[0]!.text).toContain('wait_agent')
    expect(results[0]!.text).toContain('run_in_background')
  })

  it('passes a background sleep through untouched', async () => {
    const { ctx, dispatched } = await harness()
    await runBash(ctx, 'a2', { command: 'sleep 30', run_in_background: true })
    expect(dispatched).toHaveLength(1)
  })

  it('ignores sleep text inside quoted data and comments', async () => {
    const { ctx, dispatched } = await harness()
    await runBash(ctx, 'a3', { command: 'echo "sleep 30 done" # was sleep 12 before' })
    expect(dispatched).toHaveLength(1)
  })

  it('does not match sleep inside longer words', async () => {
    const { ctx, dispatched } = await harness()
    await runBash(ctx, 'a4', { command: 'grep -r "x" . && nosleep 5 && python sleep.py' })
    expect(dispatched).toHaveLength(1)
  })

  it('switches off with banSleepPolling: false', async () => {
    const { ctx, dispatched } = await harness({ banSleepPolling: false })
    await runBash(ctx, 'a5', { command: 'sleep 30' })
    expect(dispatched).toHaveLength(1)
  })
})

describe('full-suite pytest ban', () => {
  it('denies a bare full-suite run', async () => {
    const { ctx, dispatched } = await harness()
    const agent = await runBash(ctx, 'b1', { command: 'pytest tests/ -q' })
    expect(dispatched).toHaveLength(0)
    expect(toolResults(agent)[0]!.text).toContain('run_in_background')
  })

  it('denies python -m pytest with a suite directory', async () => {
    const { ctx, dispatched } = await harness()
    await runBash(ctx, 'b2', { command: '.venv/bin/python -m pytest tests/ -q' })
    expect(dispatched).toHaveLength(0)
  })

  it('denies a chained full-suite run', async () => {
    const { ctx, dispatched } = await harness()
    await runBash(ctx, 'b3', { command: 'cd repo && pytest -q' })
    expect(dispatched).toHaveLength(0)
  })

  it('allows a file-level or selection-flagged run', async () => {
    const { ctx, dispatched } = await harness()
    await runBash(ctx, 'b4',
      { command: 'pytest tests/core/test_x.py::test_y -q' },
      { command: 'pytest -k smoke' },
      { command: 'pytest tests/core' })
    expect(dispatched).toHaveLength(3)
  })

  it('switches off with banFullSuiteTests: false', async () => {
    const { ctx, dispatched } = await harness({ banFullSuiteTests: false })
    await runBash(ctx, 'b7', { command: 'pytest tests/ -q' })
    expect(dispatched).toHaveLength(1)
  })
})

describe('non-bash traffic passes through', () => {
  it('lets any other tool run regardless of its arguments', async () => {
    const ctx = new Context()
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    let ran = false
    ctx.tools.register(defineContentToolFixture({
      name: 'other',
      description: 'o',
      parameters: { command: { type: 'string', required: true } },
      async execute() { ran = true; return [{ type: 'text', text: 'ok' }] },
    }))
    await ctx.plugin(BashHygiene, {})
    const adapter = new MockAdapter([
      toolCallResponse('c1', 'other', { command: 'sleep 30 && pytest tests/' }),
      textResponse('done'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = await ctx.agentLoop.create(SessionId('c1'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    expect(ran).toBe(true)
  })
})
