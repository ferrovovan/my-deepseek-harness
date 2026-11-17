---
description: "Package map for the loop-hygiene guard family: repeat-call reminder and blocking, bash idle-wait bans, a per-turn step ceiling, a per-step retry cap, and the tool-call timeout policy, for users and maintainers choosing or composing the guards."
kind: "package-group"
---

# guard/ — loop-hygiene guard family

English | [中文](README.zh.md)

## Summary

The `guard/` group keeps the agent loop productive by watching for the ways a turn goes idle or stuck. `repeat-tool-reminder` nudges the model out of identical tool-call loops; `duplicate-call-block` denies an identical repeat within one turn; `bash-hygiene` bans foreground `sleep` polling and full test-suite runs; `step-budget` caps steps per turn with an early wrap-up warning; `retry-budget` caps automatic LLM retries per step; `timeout-policy` times out tool calls that declare a limit. All six ship enabled in the `dsh` base bundle; a composition can tune or remove them.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

Six small plugins cover the thrashing patterns; each README below explains when to keep, tune, or remove it.

| Package | What it provides |
|---|---|
| [`repeat-tool-reminder/`](repeat-tool-reminder/README.md) | Reminds the model when it repeats the same tool call, so it changes approach or finishes |
| [`duplicate-call-block/`](duplicate-call-block/README.md) | Denies an exactly identical repeat within one turn, so the same output is never paid for twice |
| [`bash-hygiene/`](bash-hygiene/README.md) | Denies foreground sleep-polling and full-suite runs in bash, naming the sanctioned waiting and testing paths |
| [`step-budget/`](step-budget/README.md) | Caps steps per turn with a wrap-up warning before the ceiling, so a stuck loop ends deliberately |
| [`retry-budget/`](retry-budget/README.md) | Caps automatic LLM retries per step and can switch to a fallback route, so provider hiccups stay bounded |
| [`timeout-policy/`](timeout-policy/README.md) | Times out tool calls that declare a limit, so the model gets a clear error instead of waiting forever |

-----

<a id="related-documentation"></a>
## Related documentation

Start with the tools subsystem reference for the tool-call pipeline, then the reminder's configuration and the timeout-library decision behind the policy.

- [Tools subsystem reference](../../docs/subsystems/tools.md) — the tool-call pipeline and decisions both guards build on.
- [Generated configuration catalog](../../docs/config-catalog.md#deepseek-aidsh-repeat-tool-reminder) — every accepted field of the repeat-call reminder.
- [Timeout deadline library Agent Note](../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md) — the timing/termination split `timeout-policy` enforces.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
