---
description: "Hard turn step-budget guard that warns the model near the ceiling and rejects steps past it, for users and maintainers choosing, configuring, or debugging the plugin."
kind: "package-reference"
---

# @deepseek-ai/dsh-step-budget

English | [中文](README.zh.md)

## Summary

This package gives every turn a hard ceiling on steps. At a configured step it injects one wrap-up warning per turn so the model starts finishing deliberately, and past the ceiling it rejects further steps, ending the turn as blocked instead of letting a stuck loop run unbounded. The warning rides the step's message batch as a labeled notice; rejection mirrors the harness's own blocked-turn outcome. The `dsh` base bundle enables the package with a warning at step 40 and a ceiling of 60.

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

Mount this plugin when runaway turns are the failure you want bounded — a loop that will not end should cost a fixed maximum, not everything. There is nothing to learn or wire: the `dsh` base bundle already runs it; tune the two numbers below if your normal turns are legitimately longer or shorter.

### When to choose it

Choose it when autonomous agents occasionally enter step loops that run for hundreds of steps, and you want a guaranteed stop with an advance notice. Avoid it (or raise `maxSteps`) when your workloads are legitimately long-running turns — batch migrations or wide refactors driven in one turn — because the ceiling is real and will cut them off.

### Setting the ceiling and the warning

```yaml
- name: '@deepseek-ai/dsh-step-budget'
  config:
    warnAt: 40      # 1-based step that receives the one-per-turn wrap-up warning
    maxSteps: 60    # hard ceiling; a step proposed beyond it is rejected
```

| Field | Default | Meaning |
|---|---|---|
| `warnAt` | `40` | Step number (1-based) at which the wrap-up warning is injected once per turn |
| `maxSteps` | `60` | Hard ceiling on steps per turn; a higher proposed step is rejected and the turn ends |

Invalid configuration fails at startup — a non-integer or below-1 value, or a `warnAt` above `maxSteps` (a warning after the ceiling could never be read) — never a silent change of behavior. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-step-budget) documents every accepted value.

### What you get

A turn that reaches step 40 receives one labeled warning telling it the ceiling and to start wrapping up; a turn proposing step 61 is rejected and closes as blocked. Turns that finish early see nothing at all — the guard adds no context to normal turns, and the budget resets with the next turn.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how admission and rejection work; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

- **Ceiling, not suggestion.** Unlike the reminder guards, this one exercises the loop's existing admission veto: a rejected step ends the turn as `blocked`, the same outcome any rejecting listener produces, so no new turn-ending machinery is needed.
- **Warn before you cut.** The warning gives the model one stretch of steps to deliver an answer deliberately instead of being cut off mid-action; the gap between `warnAt` and `maxSteps` is the graceful-exit window.
- **One warning per turn.** A repeating warning is noise the model learns to ignore; a `WeakMap<Agent, turn>` records which turn was warned.
- **Fail loud at load.** Both knobs and their ordering validate in `apply` and throw, never falling back to defaults.

### Admission flow

The guard listens on `agent/pre-step`, where `step` is the 1-based number the loop proposes for the next step:

- `step > maxSteps`: return `{ kind: 'reject' }` without delegating — the loop closes the turn as `blocked`.
- `step < warnAt`, or the turn was already warned: delegate untouched.
- Otherwise: delegate first, then — only if downstream admitted (`enter`) — append the warning message to the decision's message batch, so the guard never replaces another listener's admission work.

Injected warnings commit as `user/message` events with source `{kind: 'step-budget', form: 'notice', summary: '<warnAt>/<maxSteps>'}`, so they are source-attributed and reconstructable from the session log.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `Config` schema, fail-loud validation, pre-step listener |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Core subsystem](../../../docs/subsystems/core.md) — the turn flow and interception decisions, including `agent/pre-step` admission this guard acts on.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-step-budget) — every accepted config field and its source declaration.
- [guard group map](../README.md) — the sibling guard packages and the loop-hygiene family.

-----

<a id="model-experience"></a>
## Model Experience

### Wrap-up warning message

#### What the model sees

At the warning step the model receives this injected notice once per turn, with the counters filled in for the configured values:

##### Step-budget warning

```markdown
Step budget: this turn has used <warnAt> of its <maxSteps> allowed steps. The turn will be stopped at step <maxSteps>. Stop starting new work now: fold your remaining actions into at most a few decisive calls, deliver the answer or report what is left and why, and end the turn deliberately rather than being cut off.
```

#### Token effect

One short message per warned turn; turns that finish before the warning step pay nothing.

#### KV Cache effect

Append-only; the warning follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the guard is a poor fit. They are current package constraints, not a task backlog.

- **Uniform ceiling** — every turn of every agent gets the same budget; per-agent or per-preset ceilings would need configuration scoping this guard does not do.
- **Steps, not time or cost** — a turn of 59 cheap steps passes while 59 expensive ones also pass; time and token budgets belong to other mechanisms.
- **No mid-turn scope reset** — only a new turn resets the budget; long tool results or compaction do not buy the turn more steps.
- **Blocked turn carries no forced summary** — the rejected turn ends as blocked with no injected "report what is left" message; the warning's instruction is the only wrap-up prompt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above and the package code.

The default numbers (40/60) come from observed coordinator sessions where loops thrashed past forty steps without progress; deployments with genuinely longer legitimate turns should raise both rather than disable the guard. An escalation that turns a blocked turn into a forced final-summary request is a plausible follow-up if blocked turns prove too silent in practice.

</details>
