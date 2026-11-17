/**
 * Retry budget guard. It caps how many times one failed model-request step
 * may be retried inside a turn, independent of the provider retry policy, and
 * on exhaustion can record a durable switch to a fallback route so the next
 * turn runs on a different model instead of hammering a failing one. It must
 * be mounted BEFORE the llm-retry plugin — llm-retry answers retryable
 * failures without delegating, so a listener registered after it never sees
 * the retries this guard is meant to count. Semantics live in the README.
 * @module @deepseek-ai/dsh-retry-budget
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, RequestErrorAction } from '@deepseek-ai/dsh-agent'

export const name = 'retry-budget'

export const inject = ['agents']

/**
 * Plugin config. `maxRetriesPerStep` counts retries only: the first request
 * of a step is free, then at most this many recovery decisions are delegated
 * downstream (0 vetoes every retry). `fallbackProvider`/`fallbackModel` name
 * an optional route to switch the agent to when a step's budget runs out;
 * the switch is durable and takes effect at the next step preparation.
 */
export interface Config {
  /** Retries allowed for one step before the guard vetoes recovery (default 2). */
  maxRetriesPerStep?: number
  /** Fallback route provider to select on budget exhaustion (empty = disabled). */
  fallbackProvider?: string
  /** Fallback route model to select on budget exhaustion (empty = disabled). */
  fallbackModel?: string
}

export const Config: z<Config> = z.object({
  maxRetriesPerStep: z.number().default(2),
  fallbackProvider: z.string().default(''),
  fallbackModel: z.string().default(''),
})

/** Per-agent view of the step whose failures are being counted. */
interface StepBudget {
  turn: number
  step: number
  /** Recovery decisions already observed (and delegated) for this step. */
  attempts: number
}

/**
 * Install the guard's listeners.
 * @param ctx - plugin context; listeners are scoped to it and disposed with it.
 * @param config - validated {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  const maxRetriesPerStep = config.maxRetriesPerStep as number
  if (!Number.isInteger(maxRetriesPerStep) || maxRetriesPerStep < 0) {
    throw new Error(`retry-budget: invalid maxRetriesPerStep ${maxRetriesPerStep} — must be an integer >= 0`)
  }
  const fallback = config.fallbackProvider !== '' && config.fallbackModel !== ''
    ? { provider: config.fallbackProvider as string, model: config.fallbackModel as string }
    : undefined

  const budgets = new WeakMap<Agent, StepBudget>()

  ctx.on('agent/request-error', async ({ agent, turn, step }, next): Promise<RequestErrorAction> => {
    let budget = budgets.get(agent)
    if (budget === undefined || budget.turn !== turn || budget.step !== step) {
      budget = { turn, step, attempts: 0 }
      budgets.set(agent, budget)
    }
    budget.attempts += 1
    if (budget.attempts <= maxRetriesPerStep) return next()
    // Budget spent: veto recovery by answering without delegating. The loop
    // closes the step with the failure. A configured fallback switch is
    // recorded durably here; the current step's selection is already frozen,
    // so it governs the next prepared step (the next turn).
    if (fallback !== undefined) agent.model.select(fallback)
    return undefined
  })
}
