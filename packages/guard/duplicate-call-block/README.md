---
description: "Hard-blocking guard that denies a tool call exactly repeating an earlier call in the same turn, for users and maintainers choosing, configuring, or debugging the plugin."
kind: "package-reference"
---

# @deepseek-ai/dsh-duplicate-call-block

English | [中文](README.zh.md)

## Summary

This package stops the strictest form of tool-call thrashing: the same agent re-issuing a call whose tool name and arguments are exactly identical to an earlier call in the same turn. The repeat is denied immediately — the model never sees a second copy of output it already has — with a reason telling it to change arguments, act on the previous result, or finish. Blocking is keyed per agent-turn, ignores configured polling tools (`wait_agent`, `job_output`, `terminal_read` by default), and compares arguments order-insensitively. The `dsh` base bundle enables the package.

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

Mount this plugin when an identical repeat should cost the model nothing instead of a full round-trip of the same output. There is nothing to learn or wire: the `dsh` base bundle already runs it, and the default exclusions cover the tools whose repeats are intentional.

### When to choose it

Choose it when stuck models re-read the same file or re-run the same command to stall a turn, and you want the repetition cut off at the source. Avoid it when identical repeats genuinely return fresh data you must collect — polling that is not in the `exclude` list will be blocked — and when you want a soft nudge instead of a hard stop; that is the sibling `repeat-tool-reminder`'s job, and the two compose.

### Exempting polling tools

```yaml
- name: '@deepseek-ai/dsh-duplicate-call-block'
  config:
    exclude: [wait_agent, job_output, terminal_read]  # exact names or `*` wildcards
```

| Field | Default | Meaning |
|---|---|---|
| `exclude` | `[wait_agent, job_output, terminal_read]` | Tool-name patterns whose identical repeats are never blocked |

### What you get

The second identical call in one agent-turn returns an error naming the tool and saying the repeat adds nothing; the first call and every non-identical call run untouched. Re-reading a file after editing it passes (the arguments differ), `todo_write` with a new list passes, and a fresh user message starts a clean turn in which every call is allowed once again.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how a call is keyed and scoped; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

- **Exact repeats only.** The guard denies only canonically identical `(tool, arguments)` pairs; anything looser stays the advisory guard's territory, so a legitimate near-repeat is never punished by mistake.
- **Turn-scoped memory.** A turn is the natural unit: re-issuing a call after new information (a user message) is reasonable, hammering within one turn is not.
- **Deny in pre-execute.** The blocked call never runs, so its cost — execution time and duplicate output tokens — is saved outright, unlike a post-hoc reminder.
- **Order-insensitive identity.** Arguments are deep-key-sorted before comparison, so `{a:1,b:2}` and `{b:2,a:1}` are the same call; raw-string argument payloads are re-parsed when possible and compared as text otherwise.

### Keying and scope

- The seen-call memory is keyed `session id : lastTurn`, where `lastTurn` comes from the harness's turn-boundary projection — the same value that says whether the user has spoken since — so the guard's turn and the model's turn are the same turn by construction.
- Calls carrying no agent share one `'agentless'` scope (a direct `ctx.tools.execute()` caller); excluded tools neither register nor trigger a block.
- State is in-memory and turn-scoped: a resumed session starts clean, and each agent-turn's `Set` is small by design.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `Config` schema, canonicalization, turn scoping, deny listener |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Tools subsystem reference](../../../docs/subsystems/tools.md) — the `tools/pre-execute` waterfall and `PreToolDecision` denial shape this guard uses.
- [repeat-tool-reminder README](../repeat-tool-reminder/README.md) — the advisory sibling that counts near-repetition instead of denying exact repeats.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-duplicate-call-block) — every accepted config field and its source declaration.

-----

<a id="model-experience"></a>
## Model Experience

### Denied duplicate tool result

#### What the model sees

A second identical call within one turn returns this tool error instead of executing, with `<toolName>` replaced by the tool's name:

##### Duplicate deny reason

```markdown
duplicate-call-block: this exact <toolName> call (identical arguments) already ran earlier in the current turn. Repeating it returns the same result and wastes the turn. Do something different: change the arguments, act on the previous result, or end the turn.
```

#### Token effect

One short error result replaces the full duplicated output the call would have produced — the guard removes tokens from the context instead of adding them, whenever the model complies.

#### KV Cache effect

Append-only; the denial appears after the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the guard is a poor fit. They are current package constraints, not a task backlog.

- **Exact-match blocking only** — a re-read with one changed path or an extra space is a different call and runs; loosening the key would punish legitimate near-repeats.
- **No result inspection** — the guard compares requests, not outputs; a tool whose value refreshes in place (a growing log tailed identically) needs an `exclude` entry, not the guard's forgiveness.
- **Same-turn scope only** — an identical call after a user message is allowed even if pointless; widening the scope to session-long is rejected pending evidence.
- **Agentless calls share one bucket** — direct executor callers without an agent are deduplicated against each other, an accepted coarseness for a path no model drives.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above and the package code.

The key is the same canonicalization the repeat-tool-reminder uses (deep key-sort + stringify); the two guards deliberately share that notion of identity even though the helper is duplicated per package. A per-tool allowance counter (allow N identical calls) is the plausible middle ground between this guard and the reminder if hard blocking proves too blunt in practice.

</details>
