/**
 * Foreground bash hygiene guard. It denies two wasteful command shapes before
 * dispatch — foreground `sleep` polling and full test-suite `pytest` runs —
 * and returns a reason that names the productive alternative (`wait_agent`,
 * end-of-turn, `run_in_background`, or a selective target). Detection and
 * message semantics live in the package README.
 * @module @deepseek-ai/dsh-bash-hygiene
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'

export const name = 'bash-hygiene'

export const inject = ['tools']

/**
 * Plugin config. Both bans default to enabled; a deployment with a different
 * loop policy can switch either one off without removing the plugin.
 */
export interface Config {
  /** Deny foreground `sleep <seconds>` polling (default true). */
  banSleepPolling?: boolean
  /** Deny full-suite `pytest` invocations (default true). */
  banFullSuiteTests?: boolean
}

export const Config: z<Config> = z.object({
  banSleepPolling: z.boolean().default(true),
  banFullSuiteTests: z.boolean().default(true),
})

/** The tool this guard inspects; other tools pass through untouched. */
const GUARDED_TOOL = 'bash'

/**
 * Blank out single- and double-quoted payloads and standalone `#` comments so
 * detection only fires on shell code, never on command data (`echo "sleep 5"`)
 * or prose inside comments.
 */
function stripShellData(command: string): string {
  return command
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/(?<!\S)#.*$/gm, '')
}

/** Foreground sleep polling: a `sleep <number>` call in command position. */
const FOREGROUND_SLEEP_PATTERN = /(?<![\w.\-])sleep\s+[0-9]+(?:\.[0-9]+)?/

/** Flags that make a pytest invocation selective rather than a full-suite run. */
const SELECTIVE_PYTEST_PATTERN = /::|(^|\s)(-k|-m|--deselect|--collect-only|--co)(\s|=)/

/** Whether one positional pytest target is narrower than a whole suite directory. */
function isSelectivePytestTarget(target: string): boolean {
  if (target.startsWith('-')) return false
  const normalized = target.replace(/\/+$/, '')
  if (normalized === 'tests' || normalized === '.' || normalized === './tests') return false
  return true
}

/**
 * Whether one `;`/`&&`/newline-separated segment runs pytest over the whole
 * suite: a bare `pytest` (or `python -m pytest`) with no selection flags and
 * no file-level targets.
 */
function isFullSuitePytestSegment(segment: string): boolean {
  const match = /(?:^|[\s;&|(])(?:python[0-9.]*\s+-m\s+)?pytest\b/.exec(segment)
  if (match === null) return false
  const after = segment.slice(match.index + match[0].length)
  if (SELECTIVE_PYTEST_PATTERN.test(after)) return false
  const targets = after.split(/\s+/).filter(t => t.length > 0 && !t.startsWith('-') && !/[<>&|]/.test(t))
  if (targets.length === 0) return true
  return targets.some(t => !isSelectivePytestTarget(t))
}

/**
 * Read the `command`/`run_in_background` fields from the execution's parsed
 * arguments, tolerating the raw-string fallback for malformed argument JSON.
 */
function readBashCall(argumentsValue: unknown): { command: string; runInBackground: boolean } | undefined {
  let parsed = argumentsValue
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return undefined
    }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const record = parsed as Record<string, unknown>
  const command = record.command
  if (typeof command !== 'string') return undefined
  return { command, runInBackground: record.run_in_background === true }
}

/** The deny reason for sleep polling: it names the sanctioned waiting paths. */
const SLEEP_DENY_REASON =
  'bash-hygiene: foreground `sleep` polling is banned. Waiting with sleep burns the turn '
  + 'while producing nothing. To wait for background work, call `wait_agent` (it returns as soon '
  + 'as a job or agent result arrives) or end your turn and let the completion notice wake you. '
  + 'To run a long command now, start it with `run_in_background: true` and collect it with job tools.'

/** The deny reason for full-suite runs: it names the selective and background paths. */
const FULL_SUITE_DENY_REASON =
  'bash-hygiene: running the full test suite in the foreground is banned. A suite that takes '
  + 'minutes starves the turn and gets re-run on a loop. Instead run only the tests that cover '
  + 'the change (`pytest path/to/test_file.py::test_name` or `-k <expr>`), or start the full '
  + 'suite with `run_in_background: true`, or use the registered acceptance/gate tool if the '
  + 'deployment provides one.'

/**
 * Install the guard's listener.
 * @param ctx - plugin context; the listener is scoped to it and disposed with it.
 * @param config - validated {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  const banSleepPolling = config.banSleepPolling as boolean
  const banFullSuiteTests = config.banFullSuiteTests as boolean

  ctx.on('tools/pre-execute', async (exec: ToolExecution, next): Promise<PreToolDecision> => {
    if (exec.name !== GUARDED_TOOL) return next()
    const call = readBashCall(exec.arguments)
    if (call === undefined || call.runInBackground) return next()
    const code = stripShellData(call.command)
    if (banSleepPolling && FOREGROUND_SLEEP_PATTERN.test(code)) {
      return { kind: 'deny', reason: SLEEP_DENY_REASON }
    }
    if (banFullSuiteTests && code.split(/[;\n]|&&|\|\|/).some(isFullSuitePytestSegment)) {
      return { kind: 'deny', reason: FULL_SUITE_DENY_REASON }
    }
    return next()
  })
}
