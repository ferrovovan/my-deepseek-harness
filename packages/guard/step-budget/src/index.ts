/**
 * Step budget guard. It gives every turn a hard ceiling: near the ceiling it
 * injects one wrap-up warning so the model starts finishing deliberately, and
 * past the ceiling it rejects further steps, ending the turn instead of
 * letting a stuck loop run unbounded. The warning rides the step's message
 * batch as a labeled notice; rejection mirrors the loop's own blocked-turn
 * outcome. Semantics and config live in the package README.
 * @module @deepseek-ai/dsh-step-budget
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContextFormed, MessageSource } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'step-budget': { kind: 'step-budget' } & ContextFormed
  }
}

export const name = 'step-budget'

export const inject = ['agents']

/**
 * Plugin config. `warnAt` is the 1-based step number at which the wrap-up
 * warning is injected once per turn; `maxSteps` is the hard ceiling — a step
 * proposed beyond it is rejected and the turn ends.
 */
export interface Config {
  /** Step that receives the one-per-turn wrap-up warning (default 40). */
  warnAt?: number
  /** Hard ceiling on steps per turn; a higher proposed step is rejected (default 60). */
  maxSteps?: number
}

export const Config: z<Config> = z.object({
  warnAt: z.number().default(40),
  maxSteps: z.number().default(60),
})

/** The labeled source stamped on the injected warning (load-bearing: an unlabeled context would render as a user prompt). */
const WARNING_SOURCE: MessageSource = { kind: 'step-budget' }

/**
 * Validate the two knobs fail-loud at load time: both must be integers and
 * `warnAt` must sit at or below `maxSteps` (a warning after the ceiling could
 * never be read).
 */
function validate(config: Config): { warnAt: number, maxSteps: number } {
  const warnAt = config.warnAt as number
  const maxSteps = config.maxSteps as number
  if (!Number.isInteger(warnAt) || warnAt < 1) {
    throw new Error(`step-budget: invalid warnAt ${warnAt} — must be an integer >= 1`)
  }
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new Error(`step-budget: invalid maxSteps ${maxSteps} — must be an integer >= 1`)
  }
  if (warnAt > maxSteps) {
    throw new Error(`step-budget: warnAt ${warnAt} must not exceed maxSteps ${maxSteps}`)
  }
  return { warnAt, maxSteps }
}

/**
 * Install the guard's listener.
 * @param ctx - plugin context; listeners are scoped to it and disposed with it.
 * @param config - validated {@link Config}; the pair is re-checked fail-loud here.
 */
export function apply(ctx: Context, config: Config): void {
  const { warnAt, maxSteps } = validate(config)

  /** Turn number in which each agent already received its warning (one per turn). */
  const warned = new WeakMap<Agent, number>()

  /** The wrap-up warning injected once per turn at `warnAt`. */
  function warning(currentStep: number): UserMessage {
    return createUserMessage({
      content: [{
        type: 'text',
        text: `Step budget: this turn has used ${String(currentStep)} of its ${String(maxSteps)} allowed steps. `
          + `The turn will be stopped at step ${String(maxSteps)}. Stop starting new work now: fold your `
          + 'remaining actions into at most a few decisive calls, deliver the answer or report what is '
          + 'left and why, and end the turn deliberately rather than being cut off.',
      }],
      source: { ...WARNING_SOURCE, form: 'notice', summary: `step budget: ${String(warnAt)}/${String(maxSteps)}` },
    })
  }

  ctx.on('agent/pre-step', async ({ agent, turn, step }, next): Promise<PreStepDecision> => {
    // Past the ceiling: veto the step. The loop closes the turn as `blocked`,
    // which is the same outcome the harness uses for any rejected admission.
    if (step > maxSteps) return { kind: 'reject' }
    const downstream = await next()
    // At the warning step, exactly once per turn: ride the warning along with
    // whatever the downstream listeners admitted (never replacing their work).
    if (step < warnAt || downstream.kind !== 'enter') return downstream
    if (warned.get(agent) === turn) return downstream
    warned.set(agent, turn)
    return { ...downstream, messages: [...downstream.messages, warning(step)] }
  })
}
