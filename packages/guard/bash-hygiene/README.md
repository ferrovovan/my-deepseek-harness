---
description: "Hard-blocking bash hygiene guard that denies sleep-polling and foreground full test-suite runs, for users and maintainers choosing, configuring, or debugging the plugin."
kind: "package-reference"
---

# @deepseek-ai/dsh-bash-hygiene

English | [中文](README.zh.md)

## Summary

This package stops two ways a model wastes a turn inside the `bash` tool: foreground `sleep` polling (waiting by doing nothing) and full test-suite runs in the foreground (starving the turn for minutes). Both are denied with a reason that names the sanctioned alternative — `wait_agent`, ending the turn, `run_in_background`, or a selective test target. The guard sees only the `bash` tool, ignores background calls, and strips quoted payloads and comments before matching, so a string that merely mentions `sleep` is not denied. The `dsh` base bundle enables the package with both bans on.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin when a model should be forced off idle-wait and suite-hammering habits. There is nothing to learn or wire: the `dsh` base bundle already runs it with both bans on, and the deny reasons teach the model the alternatives on the spot.

### When to choose it

Choose it when agents in your deployment burn turns on `sleep 5 && check`, or re-run whole test suites synchronously between edits. Avoid it when foreground sleeping is a legitimate workflow for your users (the ban is a policy, not a universal law) or when your deployment has no alternative waiting path to point the model at — a denial that names no exit only provokes retries.

### Turning the bans on and off

Each ban is an independent switch:

```yaml
- name: '@deepseek-ai/dsh-bash-hygiene'
  config:
    banSleepPolling: true      # deny foreground `sleep <n>` usage
    banFullSuiteTests: true    # deny full `pytest`-style suite runs in the foreground
```

| Field | Default | Meaning |
|---|---|---|
| `banSleepPolling` | `true` | Deny foreground bash commands that poll with `sleep <seconds>` |
| `banFullSuiteTests` | `true` | Deny foreground pytest invocations that select no subset |

### What you get

A denied call returns the deny reason as its tool error, and the reason names the way out: sleep polling is redirected to `wait_agent`, ending the turn, or `run_in_background`; a full-suite run is redirected to a selective invocation (`path::test`, `-k`, `-m`, `--deselect`), a background run, or the deployment's gate tool. Selective pytest runs, `sleep` inside quoted data or comments, and every background (`run_in_background: true`) call pass untouched.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the guard reads a bash call and decides; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

- **Deny, don't nudge.** Unlike the sibling reminder guard, this one vetoes on `tools/pre-execute`: idle-wait and suite-hammering have no productive repeat count, so the loop should not run the call at all.
- **Every denial names an exit.** Each deny reason lists the sanctioned alternatives, so the model can comply in one step instead of probing around the ban.
- **Match code, not data.** Quoted payloads and `#` comments are blanked before matching, so a `grep 'sleep'` or an echo mentioning a suite does not trip the ban.
- **Background is always allowed.** A `run_in_background: true` call is exactly what the bans want the model to do, so it bypasses inspection entirely.

### Detection

- **Sleep polling** matches `sleep <number>` outside a word context (a `--sleep`-style flag name or `10sleep` does not match). Any foreground sleep with a numeric operand is denied — waiting is the model's decision to make through `wait_agent`, not through wall-clock stalls.
- **Full-suite pytest** matches a `pytest` (or `python -m pytest`) segment that selects nothing: no `::` node id, no `-k`/`-m`/`--deselect`/`--collect-only`. Commands joined by `;`, `&&`, `||`, or newlines are checked segment by segment, so `pytest a && pytest` is denied for its second segment.
- **Argument reading is lenient.** Malformed or non-object arguments yield no parsed command and pass through — the tool's own argument validation stays the authority.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `Config` schema, shell-text stripping, pattern detection, deny listener |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Tools subsystem reference](../../../docs/subsystems/tools.md) — the `tools/pre-execute` waterfall and `PreToolDecision` denial shape this guard uses.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-bash-hygiene) — every accepted config field and its source declaration.
- [guard group map](../README.md) — the sibling guard packages and the loop-hygiene family.

-----

<a id="model-experience"></a>
## Model Experience

### Denied sleep-poll tool result

#### What the model sees

A denied foreground sleep call returns this tool error instead of executing:

##### Sleep deny reason

```markdown
bash-hygiene: foreground `sleep` polling is banned. Waiting with sleep burns the turn while producing nothing. To wait for background work, call `wait_agent` (it returns as soon as a job or agent result arrives) or end your turn and let the completion notice wake you. To run a long command now, start it with `run_in_background: true` and collect it with job tools.
```

#### Token effect

One short error result per denied call, replacing the output a completed sleep would have produced; nothing accumulates when the model switches to `wait_agent`.

#### KV Cache effect

Append-only; the denial appears after the reusable request prefix and does not invalidate existing KV-cache entries.

### Denied full-suite tool result

#### What the model sees

A denied foreground full-suite run returns this tool error instead of executing:

##### Full-suite deny reason

```markdown
bash-hygiene: running the full test suite in the foreground is banned. A suite that takes minutes starves the turn and gets re-run on a loop. Instead run only the tests that cover the change (`pytest path/to/test_file.py::test_name` or `-k <expr>`), or start the full suite with `run_in_background: true`, or use the registered acceptance/gate tool if the deployment provides one.
```

#### Token effect

One short error result per denied call, replacing a multi-minute transcript the suite would have streamed into the context.

#### KV Cache effect

Append-only; the denial appears after the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the guard is a poor fit. They are current package constraints, not a task backlog.

- **`bash` only** — other shell-like tools (a REPL terminal running `sleep`) are out of scope by design; the ban set names the two observed wasting patterns, not a general shell policy.
- **Substring-free but simple patterns** — exotic shells that hide a sleep behind variable indirection (`S=sl;eep 5` or `$CMD`) are not detected; the guard matches literal code after comment/quote stripping.
- **Other full-suite runners unclaimed** — the suite ban covers pytest invocations only; `npm test`, `go test ./...` and similar need per-ecosystem selectors before they can be banned fairly.
- **No grace budget** — the ban is unconditional while enabled; a first-allowed-then-denied allowance is not implemented.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above and the package code.

The bans deliberately live in a mountable guard instead of the core `bash` tool: the tool's own fixtures use foreground `sleep` legitimately, and the policy belongs to the composition, not the primitive. A per-command allowlist (e.g. short sleeps under a configurable number of seconds) is the obvious next knob if real deployments need it.

</details>
