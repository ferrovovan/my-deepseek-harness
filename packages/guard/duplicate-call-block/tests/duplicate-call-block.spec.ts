import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import * as DuplicateCallBlock from '@deepseek-ai/dsh-duplicate-call-block'
import type { Config } from '@deepseek-ai/dsh-duplicate-call-block'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

/**
 * Behavior suite for the hard duplicate-call block: exact repeats of one
 * tool+arguments pair inside a turn are denied with only one dispatch, while
 * different arguments, different tools, excluded names, key order, and calls
 * in a later turn all pass through.
 */

/** Boot the spine + the guard with recording `probe`, `other`, `wait_agent` fixtures. */
async function harness(config: Config = {}): Promise<{ ctx: Context; dispatched: string[] }> {
  const ctx = new Context()
  const dispatched: string[] = []
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  for (const name of ['probe', 'other', 'wait_agent']) {
    ctx.tools.register(defineContentToolFixture({
      name,
      description: name,
      parameters: { payload: { type: 'json' } },
      async execute(args) {
        dispatched.push(`${name} ${JSON.stringify((args as { payload?: unknown }).payload ?? null)}`)
        return [{ type: 'text', text: 'ok' }]
      },
    }))
  }
  await ctx.plugin(DuplicateCallBlock, config)
  return { ctx, dispatched }
}

function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => { const d = ctx.on('agent/status', ({ agent: s, status: st }) => { if (s === agent && st === 'idle') { d(); resolve() } }) })
}

/** Drive one turn of scripted tool calls, settling at idle. */
async function driveTurn(ctx: Context, session: string, calls: { tool: string; args: object }[]): Promise<Agent> {
  const adapter = new MockAdapter([
    ...calls.map((call, i) => toolCallResponse(`c${i}`, call.tool, call.args)),
    textResponse('done'),
  ])
  ctx.llm.registerAdapter([session], adapter)
  const agent = await ctx.agentLoop.create(SessionId(session), { provider: session, model: session })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
  await waitForIdle(ctx, agent)
  return agent
}

/** The tool results recorded for the agent's calls. */
function toolResults(agent: Agent): { isError: boolean; text: string }[] {
  return agent.session.snapshotEvents()
    .filter((e): e is SessionEvent<'tool/result'> => e.type === 'tool/result')
    .map(e => ({
      isError: e.data.message.isError,
      text: e.data.message.content.map(b => b.type === 'text' ? b.text : '').join(''),
    }))
}

describe('exact repeats within one turn', () => {
  it('denies the second identical call and dispatches once', async () => {
    const { ctx, dispatched } = await harness()
    const agent = await driveTurn(ctx, 'a1', [
      { tool: 'probe', args: { payload: { x: 1 } } },
      { tool: 'probe', args: { payload: { x: 1 } } },
    ])
    expect(dispatched).toEqual(['probe {"x":1}'])
    const results = toolResults(agent)
    expect(results).toHaveLength(2)
    expect(results[0]!.isError).toBe(false)
    expect(results[1]!.isError).toBe(true)
    expect(results[1]!.text).toContain('duplicate-call-block')
    expect(results[1]!.text).toContain('end the turn')
  })

  it('treats reordered argument keys as the same call', async () => {
    const { ctx, dispatched } = await harness()
    await driveTurn(ctx, 'a2', [
      { tool: 'probe', args: { payload: { a: 1, b: 2 } } },
      { tool: 'probe', args: { payload: { b: 2, a: 1 } } },
    ])
    expect(dispatched).toHaveLength(1)
  })

  it('passes different arguments and different tools through', async () => {
    const { ctx, dispatched } = await harness()
    const agent = await driveTurn(ctx, 'a3', [
      { tool: 'probe', args: { payload: { x: 1 } } },
      { tool: 'probe', args: { payload: { x: 2 } } },
      { tool: 'other', args: { payload: { x: 1 } } },
    ])
    expect(dispatched).toHaveLength(3)
    expect(toolResults(agent).every(r => !r.isError)).toBe(true)
  })

  it('excludes wait-style poll tools listed in config by default', async () => {
    const { ctx, dispatched } = await harness()
    await driveTurn(ctx, 'a4', [
      { tool: 'wait_agent', args: {} },
      { tool: 'wait_agent', args: {} },
    ])
    expect(dispatched).toHaveLength(2)
  })

  it('honors a custom exclude list', async () => {
    const { ctx, dispatched } = await harness({ exclude: ['probe'] })
    await driveTurn(ctx, 'a5', [
      { tool: 'probe', args: { payload: { x: 1 } } },
      { tool: 'probe', args: { payload: { x: 1 } } },
    ])
    expect(dispatched).toHaveLength(2)
  })
})

describe('turn scoping', () => {
  it('allows the same call again in a later turn', async () => {
    const { ctx, dispatched } = await harness()
    // One adapter script spans both turns: turn 1 repeats the call (second
    // denied), turn 2 makes it again — fresh scope, must dispatch.
    const adapter = new MockAdapter([
      toolCallResponse('c0', 'probe', { payload: { x: 1 } }),
      toolCallResponse('c1', 'probe', { payload: { x: 1 } }),
      textResponse('done'),
      toolCallResponse('d0', 'probe', { payload: { x: 1 } }),
      textResponse('done2'),
    ])
    ctx.llm.registerAdapter(['a6'], adapter)
    const agent = await ctx.agentLoop.create(SessionId('a6'), { provider: 'a6', model: 'a6' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    expect(dispatched).toHaveLength(1)
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'again' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    expect(dispatched).toHaveLength(2)
    expect(toolResults(agent).filter(r => r.isError)).toHaveLength(1)
  })
})
