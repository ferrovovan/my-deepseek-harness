---
description: "Hard retry-budget guard that caps per-step LLM retries and can switch the agent to a fallback route, for users and maintainers choosing, configuring, or debugging the plugin."
kind: "package-reference"
---

# @deepseek-ai/dsh-retry-budget

English | [中文](README.zh.md)

## Summary

This package bounds what the automatic LLM retry loop can cost. The retry listener keeps a per-step attempt count; past the configured cap it stops delegating, so the failing step ends instead of retrying to the provider's own (often much higher) limit. Optionally it selects a fallback provider/model when it vetoes, so a persistently failing route is abandoned from the next turn. The `dsh` base bundle enables the package with a cap of 2 retries per step and no fallback.

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

Mount this plugin when provider hiccup retries should be cheap and bounded. There is nothing to learn or wire: the `dsh` base bundle already runs it. The plugin must be mounted before the retry listener (`@deepseek-ai/dsh-llm-retry`), which the base bundle guarantees by row order — mount order is the veto mechanism.

### When to choose it

Choose it when a rate-limited or flaky route makes the default retry ladder (five retries with growing backoff per step) dominate turn latency and cost. Avoid it when your providers' own retry policy is already tighter than the cap — the guard only ever stops earlier, never later — or when every transient failure must be retried as long as the provider allows it.

### Setting the cap and the fallback

```yaml
- name: '@deepseek-ai/dsh-retry-budget'
  config:
    maxRetriesPerStep: 2       # retries delegated per step before the step fails
    fallbackProvider: ''       # both set together = route selected on veto
    fallbackModel: ''          # empty (either one) = no fallback, just stop
```

| Field | Default | Meaning |
|---|---|---|
| `maxRetriesPerStep` | `2` | Retry attempts delegated per step; the next failure ends the step (max 3 requests per step) |
| `fallbackProvider` | `''` | Provider of the route selected when the budget is exhausted |
| `fallbackModel` | `''` | Model of that route; fallback needs both fields non-empty |

Invalid configuration fails at startup — a non-integer or negative `maxRetriesPerStep` — never a silent change of behavior. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-retry-budget) documents every accepted value.

### What you get

A failing step burns at most `1 + maxRetriesPerStep` requests, then the turn ends with the provider error as usual. With a fallback configured, the veto also records a durable model-selection of the fallback route; because the retry loop runs with a frozen route, the switch takes effect for the next turn, letting the agent recover on a healthy route instead of hammering a dead one.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the veto composes with the retry listener; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

- **Veto by order, not by override.** The retry path is a `agent/request-error` waterfall: the outermost listener runs first, and any listener that returns a decision without calling `next()` short-circuits the inner ones. Mounted before `llm-retry`, this guard simply stops delegating when the budget is spent, and `llm-retry` never sees the failure — no shared counter, no patched listener.
- **Per-step counting.** The retry loop re-drives the same step, so attempts are counted per `(turn, step)`; a new turn or step resets the count, matching how much pain one failing step should cost.
- **Count starts after the first request.** The first request is not a retry; attempts 1..N are delegated, attempt N+1 is vetoed — the cap counts retries, not requests.
- **Fail loud at load.** `maxRetriesPerStep` validates in `apply` and throws, never falling back to a default.

### The veto and the fallback

A `WeakMap<Agent, {turn, step, attempts}>` holds the current step's budget; on each `agent/request-error` the count increments. Within budget the guard delegates (`next()`), letting `llm-retry` schedule its backoff. Past budget it returns no retry action — the loop throws the `LlmError` and the turn ends `error`. When a fallback route is configured, the veto branch also calls `agent.model.select(fallback)`, which appends a durable `model/selection` session event. The retry loop re-prepares the request with the frozen step selection, so the new route is not used for the current step — it takes effect on the next turn, which is the intended recovery granularity (a route flaky mid-step is also the one the fallback should replace).

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `Config` schema, fail-loud validation, per-step budget, veto listener |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [LLM streaming subsystem reference](../../../docs/subsystems/llm-streaming.md) — the retry lifecycle (`llm/retry-started`) and failure classification the guard bounds.
- [llm-retry README](../../../packages/llm/llm-retry/README.md) — the retry listener whose ladder this budget caps.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-retry-budget) — every accepted config field and its source declaration.

-----

<a id="model-experience"></a>
## Model Experience

### Capped retry failure

#### What the model sees

Nothing new: a budget-vetoed step fails exactly like an exhausted-provider step — the turn ends with the provider error and the model sees the same failed-turn state on its next wake. No message or tool output is injected by the guard.

#### Token effect

Strictly fewer tokens than uncapped retrying: at most `maxRetriesPerStep` retry responses (each a full request round-trip) are skipped once the budget is spent.

#### KV Cache effect

Neutral; the guard adds no context, and stopping earlier leaves the existing KV-cache prefix untouched.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the guard is a poor fit. They are current package constraints, not a task backlog.

- **Fallback lands next turn** — the frozen step selection cannot be swapped mid-step, so the capped step itself still fails on the old route; immediate in-step switching would require the loop to re-prepare with a new selection, which it deliberately does not.
- **No fallback validation at load** — the fallback route is not probed at startup; a typo shows up as a failed next turn, not a startup error, because probing every route is the provider's contract, not the guard's.
- **Per-agent step memory** — budgets are keyed on the live `Agent` object; a recreated agent starts fresh counts, an accepted cost of in-memory state.
- **Counts every failure kind** — the budget counts any failure the retry waterfall sees, not only transient ones; permanently-failing codes already stop earlier because `llm-retry` does not retry them.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above and the package code.

The registration-order dependency on `llm-retry` is the one fragile invariant: a composition that mounts the guard after the retry listener silently loses the veto (retries would run to the provider cap as if the guard were absent). The base bundle's patch row order encodes it; a manifest-level dependency on mount order would make it structural. A junior-to-senior ladder (first fallback route fails again → escalate to another) is the obvious extension of the single configured fallback.

</details>
