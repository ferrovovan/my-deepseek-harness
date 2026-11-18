import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage, LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, ResolvedRetryPolicy, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import * as LlmRetry from '@deepseek-ai/dsh-llm-retry'
import * as RetryBudget from '@deepseek-ai/dsh-retry-budget'
import type { Config } from '@deepseek-ai/dsh-retry-budget'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

/**
 * Behavior suite for the retry budget guard. Every harness mounts the guard
 * BEFORE llm-retry — the order the guard requires: llm-retry answers retryable
 * failures without delegating, so only an outermost listener can veto it.
 */

type ScriptEntry = StreamChunk[] | ((options: GenerateOptions) => StreamChunk[])

/** Retryable provider failure the scripted budget policy always accepts. */
function failure(): StreamChunk[] {
  throw new LlmError('busy', 'RATE_LIMIT')
}

/** Small bounded policy: generous cap, sub-millisecond backoff. */
const providerPolicy: ResolvedRetryPolicy = Object.freeze({
  mode: 'normal' as const,
  maxRetries: 5,
  retryableCodes: Object.freeze(['RATE_LIMIT']),
  initialDelayMs: 1,
  maxDelayMs: 2,
  jitterRatio: 0,
})

class BudgetAdapter extends MockAdapter {
  constructor(script: ScriptEntry[]) {
    super(script)
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return providerPolicy
  }
}

let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

/** Boot spine + guard + llm-retry (in that order) + a probe-free AgentLoop. */
async function harness(_adapter: BudgetAdapter, config: Config = {}): Promise<Context> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(RetryBudget, config)
  await LlmRetry.apply(ctx, {}, {})
  await ctx.plugin(AgentLoop, { agents: [] })
  context = ctx
  return ctx
}

async function runTurn(_ctx: Context, agent: Agent, text: string): Promise<void> {
  agent.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }))
  await agent.whenIdle()
}

function retryStartedCount(agent: Agent): number {
  return agent.session.snapshotEvents()
    .filter(e => (e as { type: string }).type === 'llm/retry-started')
    .length
}

function turnEndReasons(agent: Agent): string[] {
  return agent.session.snapshotEvents()
    .filter((e): e is SessionEvent<'turn/end'> => e.type === 'turn/end')
    .map(e => e.data.reason.kind)
}

function selections(agent: Agent): { provider: string; model: string }[] {
  return agent.session.snapshotEvents()
    .filter((e): e is SessionEvent<'model/selection'> => e.type === 'model/selection')
    .map(e => ({ provider: e.data.provider, model: e.data.model }))
}

describe('per-step retry cap', () => {
  it('vetoed recovery stops retries at the budget and fails the step', async () => {
    const adapter = new BudgetAdapter([failure, failure, failure, failure, failure, failure, textResponse('ok')])
    const ctx = await harness(adapter, { maxRetriesPerStep: 2 })
    ctx.llm.registerAdapter(['rb1'], adapter)
    const agent = await ctx.agentLoop.create(SessionId('rb1'), { provider: 'rb1', model: 'rb1' })
    await runTurn(ctx, agent, 'go')

    // One first request plus exactly two delegated retries; the third
    // failure is vetoed even though the provider policy allows five.
    expect(adapter.requests).toHaveLength(3)
    expect(retryStartedCount(agent)).toBe(2)
    expect(turnEndReasons(agent)).toEqual(['error'])
  })

  it('a budget of zero vetoes every retry', async () => {
    const adapter = new BudgetAdapter([failure, textResponse('never')])
    const ctx = await harness(adapter, { maxRetriesPerStep: 0 })
    ctx.llm.registerAdapter(['rb0'], adapter)
    const agent = await ctx.agentLoop.create(SessionId('rb0'), { provider: 'rb0', model: 'rb0' })
    await runTurn(ctx, agent, 'go')

    expect(adapter.requests).toHaveLength(1)
    expect(retryStartedCount(agent)).toBe(0)
    expect(turnEndReasons(agent)).toEqual(['error'])
  })

  it('without the guard the same policy retries further', async () => {
    // Control: identical adapter and provider policy, no guard mounted.
    const adapter = new BudgetAdapter([failure, failure, failure, failure, failure, failure, textResponse('ok')])
    const ctx = new Context()
    await mountAgentLoopTestDependencies(ctx)
    await LlmRetry.apply(ctx, {}, {})
    await ctx.plugin(AgentLoop, { agents: [] })
    context = ctx
    ctx.llm.registerAdapter(['rb2'], adapter)
    const agent = await ctx.agentLoop.create(SessionId('rb2'), { provider: 'rb2', model: 'rb2' })
    await runTurn(ctx, agent, 'go')

    // Full provider budget: first request + all 5 policy retries before the
    // provider's own cap vetoes; the guard would have stopped at two.
    expect(adapter.requests).toHaveLength(6)
    expect(retryStartedCount(agent)).toBe(5)
    expect(turnEndReasons(agent)).toEqual(['error'])
  })
})

describe('budget lifetime', () => {
  it('resets per step so a later turn gets a fresh budget', async () => {
    const adapter = new BudgetAdapter([failure, failure, failure, textResponse('ok')])
    const ctx = await harness(adapter, { maxRetriesPerStep: 1 })
    ctx.llm.registerAdapter(['rb3'], adapter)
    const agent = await ctx.agentLoop.create(SessionId('rb3'), { provider: 'rb3', model: 'rb3' })

    await runTurn(ctx, agent, 'first')
    expect(adapter.requests).toHaveLength(2)
    await runTurn(ctx, agent, 'second')

    // Turn two spends its own one retry and succeeds on the next request.
    expect(adapter.requests).toHaveLength(4)
    expect(turnEndReasons(agent)).toEqual(['error', 'completed'])
  })
})

describe('fallback route on exhaustion', () => {
  it('records a durable model switch served by the fallback route next turn', async () => {
    const adapter = new BudgetAdapter([failure])
    const backup = new MockAdapter([textResponse('backup says ok')])
    const ctx = await harness(adapter, {
      maxRetriesPerStep: 0,
      fallbackProvider: 'backup',
      fallbackModel: 'b1',
    })
    ctx.llm.registerAdapter(['rb4'], adapter)
    ctx.llm.registerAdapter(['backup'], backup)
    const agent = await ctx.agentLoop.create(SessionId('rb4'), { provider: 'rb4', model: 'rb4' })

    await runTurn(ctx, agent, 'first')
    expect(turnEndReasons(agent)).toEqual(['error'])
    expect(selections(agent)).toEqual([{ provider: 'backup', model: 'b1' }])

    await runTurn(ctx, agent, 'second')
    expect(backup.requests).toHaveLength(1)
    expect(turnEndReasons(agent)).toEqual(['error', 'completed'])
  })

  it('does not touch the selection while retries remain', async () => {
    const adapter = new BudgetAdapter([failure, textResponse('ok')])
    const ctx = await harness(adapter, {
      maxRetriesPerStep: 2,
      fallbackProvider: 'backup',
      fallbackModel: 'b1',
    })
    ctx.llm.registerAdapter(['rb5'], adapter)
    const agent = await ctx.agentLoop.create(SessionId('rb5'), { provider: 'rb5', model: 'rb5' })
    await runTurn(ctx, agent, 'go')

    expect(adapter.requests).toHaveLength(2)
    expect(selections(agent)).toEqual([])
    expect(turnEndReasons(agent)).toEqual(['completed'])
  })
})

describe('config validation', () => {
  it('rejects a negative or fractional budget', async () => {
    const ctx = new Context()
    await mountAgentLoopTestDependencies(ctx)
    await expect(ctx.plugin(RetryBudget, { maxRetriesPerStep: -1 })).rejects
      .toThrow('retry-budget: invalid maxRetriesPerStep')
    await expect(ctx.plugin(RetryBudget, { maxRetriesPerStep: 1.5 })).rejects
      .toThrow('retry-budget: invalid maxRetriesPerStep')
    await ctx.fiber.dispose()
  })
})
