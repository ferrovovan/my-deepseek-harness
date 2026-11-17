import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import * as StepBudget from '@deepseek-ai/dsh-step-budget'
import type { Config } from '@deepseek-ai/dsh-step-budget'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

/**
 * Behavior suite for the step budget guard: the once-per-turn wrap-up warning
 * at `warnAt`, the rejected step past `maxSteps` ending the turn as blocked,
 * normal turns untouched below the ceiling, and the fail-loud config checks.
 */

/** Boot the spine + the guard with a `probe` fixture always available. */
async function harness(config: Config = {}): Promise<Context> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.tools.register(defineContentToolFixture({
    name: 'probe',
    description: 'p',
    parameters: {},
    async execute() { return [{ type: 'text', text: 'ok' }] },
  }))
  await ctx.plugin(StepBudget, config)
  return ctx
}

function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => { const d = ctx.on('agent/status', ({ agent: s, status: st }) => { if (s === agent && st === 'idle') { d(); resolve() } }) })
}

/** Start an agent whose script keeps calling `probe` until it runs out. */
async function looping(ctx: Context, session: string, toolCalls: number): Promise<Agent> {
  const adapter = new MockAdapter([
    ...Array.from({ length: toolCalls }, (_, i) => toolCallResponse(`c${String(i)}`, 'probe', {})),
    textResponse('done'),
  ])
  ctx.llm.registerAdapter([session], adapter)
  const agent = await ctx.agentLoop.create(SessionId(session), { provider: session, model: session })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
  await waitForIdle(ctx, agent)
  return agent
}

function budgetNotices(agent: Agent): number {
  return agent.session.snapshotEvents()
    .filter((e): e is SessionEvent<'user/message'> => e.type === 'user/message' && e.data.source.kind === 'step-budget')
    .length
}

function turnEndReasons(agent: Agent): string[] {
  return agent.session.snapshotEvents()
    .filter((e): e is SessionEvent<'turn/end'> => e.type === 'turn/end')
    .map(e => e.data.reason.kind)
}

function stepStarts(agent: Agent): number[] {
  return agent.session.snapshotEvents()
    .filter((e): e is SessionEvent<'step/start'> => e.type === 'step/start')
    .map(e => e.data.step)
}

describe('hard ceiling', () => {
  it('rejects the step past maxSteps and ends the turn blocked', async () => {
    const ctx = await harness({ warnAt: 2, maxSteps: 3 })
    const agent = await looping(ctx, 'a1', 10)
    // Steps 1..3 admitted; the step proposed as 4 was rejected before start.
    expect(stepStarts(agent)).toEqual([1, 2, 3])
    expect(turnEndReasons(agent)).toEqual(['blocked'])
  })

  it('injects the wrap-up notice once, at warnAt', async () => {
    const ctx = await harness({ warnAt: 2, maxSteps: 3 })
    const agent = await looping(ctx, 'a2', 10)
    expect(budgetNotices(agent)).toBe(1)
  })

  it('leaves a short turn alone — no notice, normal completion', async () => {
    const ctx = await harness({ warnAt: 2, maxSteps: 3 })
    const adapter = new MockAdapter([textResponse('hello')])
    ctx.llm.registerAdapter(['a3'], adapter)
    const agent = await ctx.agentLoop.create(SessionId('a3'), { provider: 'a3', model: 'a3' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    expect(budgetNotices(agent)).toBe(0)
    expect(turnEndReasons(agent)).toEqual(['completed'])
  })

  it('warns once per turn, not once per agent', async () => {
    const ctx = await harness({ warnAt: 2, maxSteps: 5 })
    const adapter = new MockAdapter([
      toolCallResponse('c0', 'probe', {}),
      toolCallResponse('c1', 'probe', {}),
      textResponse('first'),
      toolCallResponse('c2', 'probe', {}),
      toolCallResponse('c3', 'probe', {}),
      textResponse('second'),
    ])
    ctx.llm.registerAdapter(['a4'], adapter)
    const agent = await ctx.agentLoop.create(SessionId('a4'), { provider: 'a4', model: 'a4' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    expect(budgetNotices(agent)).toBe(1)
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'again' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    expect(budgetNotices(agent)).toBe(2)
    expect(turnEndReasons(agent)).toEqual(['completed', 'completed'])
  })
})

describe('fail-loud configuration', () => {
  it('refuses maxSteps below 1', async () => {
    await expect((async () => {
      const inner = new Context()
      await mountAgentLoopTestDependencies(inner)
      await inner.plugin(StepBudget, { warnAt: 1, maxSteps: 0 })
    })()).rejects.toThrow('step-budget')
  })

  it('refuses warnAt above maxSteps', async () => {
    await expect((async () => {
      const inner = new Context()
      await mountAgentLoopTestDependencies(inner)
      await inner.plugin(StepBudget, { warnAt: 10, maxSteps: 5 })
    })()).rejects.toThrow('must not exceed')
  })
})
