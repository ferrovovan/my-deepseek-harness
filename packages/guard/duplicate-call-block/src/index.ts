/**
 * Hard duplicate-call block. It denies a tool call whose tool name and
 * canonical arguments exactly repeat an earlier call made by the same agent
 * in the same turn, so a model re-issuing an identical call gets an immediate
 * error instead of a second helping of the same output. The advisory
 * repeat-tool-reminder guard warns about repetition; this guard stops the
 * strict, exact form of it. Scope, keying, and exemptions live in the README.
 * @module @deepseek-ai/dsh-duplicate-call-block
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'

export const name = 'duplicate-call-block'

export const inject = ['agents']

/**
 * Plugin config. `exclude` lists tool-name patterns (exact or `*`-wildcard)
 * whose calls are never blocked — for tools where an identical repeat is the
 * intended usage, such as polling `wait_agent` or `job_output`.
 */
export interface Config {
  /** Tool-name patterns exempt from blocking. */
  exclude?: string[]
}

export const Config: z<Config> = z.object({
  exclude: z.array(z.string()).default(['wait_agent', 'job_output', 'terminal_read']),
})

/** Recursively sort object keys so argument comparison is order-insensitive. */
function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortJsonValue((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/** Canonical string form of a call's arguments: deep key-sort, then stringify. */
function canonicalize(argumentsValue: unknown): string {
  // Raw-string arguments (the malformed-JSON fallback path) are re-parsed
  // when possible so they compare by value, and as-is otherwise.
  if (typeof argumentsValue === 'string') {
    try {
      return JSON.stringify(sortJsonValue(JSON.parse(argumentsValue)))
    } catch {
      return argumentsValue
    }
  }
  return JSON.stringify(sortJsonValue(argumentsValue))
}

/** Compile one `*`-wildcard pattern to an anchored RegExp (metacharacters literal). */
function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, String.raw`\$&`)
  return new RegExp(`^${escaped.replaceAll('*', '.*')}$`)
}

/**
 * Install the guard's listener.
 * @param ctx - plugin context; listeners are scoped to it and disposed with it.
 * @param config - validated {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  const excludePatterns = (config.exclude as string[]).map(wildcardToRegExp)

  /**
   * Identity of one agent-turn: `lastTurn` from the turn-boundary projection
   * (0 before the first turn, bumped when the user speaks again), so the
   * memory resets per turn exactly as the model experiences turns.
   */
  const turnScope = (exec: ToolExecution): string => {
    const agent = exec.agent
    if (agent === undefined) return 'agentless'
    return `${agent.session.id}:${String(ctx.agents.turnBoundaryOf(agent.session).lastTurn)}`
  }

  /** Call keys already seen in one agent-turn. */
  const seen = new Map<string, Set<string>>()

  ctx.on('tools/pre-execute', async (exec: ToolExecution, next): Promise<PreToolDecision> => {
    if (excludePatterns.some(p => p.test(exec.name))) return next()
    const scope = turnScope(exec)
    let keys = seen.get(scope)
    if (keys === undefined) {
      keys = new Set<string>()
      seen.set(scope, keys)
    }
    const key = `${exec.name} ${canonicalize(exec.arguments)}`
    if (keys.has(key)) {
      return {
        kind: 'deny',
        reason: 'duplicate-call-block: this exact ' + exec.name
          + ' call (identical arguments) already ran earlier in the current turn. Repeating it '
          + 'returns the same result and wastes the turn. Do something different: change the '
          + 'arguments, act on the previous result, or end the turn.',
      }
    }
    keys.add(key)
    return next()
  })
}
