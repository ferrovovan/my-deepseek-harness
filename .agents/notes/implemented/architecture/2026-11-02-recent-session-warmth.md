# Agent Note: Recent Session warmth in Workspace navigation

Status: implemented

English | [中文](2026-11-02-recent-session-warmth.zh.md)

## Problem

Releasing the last `SessionReference` tears down the Client `Session`: its event window and `follow` stream die, and the next `open` refetches a complete opening snapshot. `session.follow` has no resume cursor (decided in [Session history and event transport](2026-08-18-session-history-and-event-transport.md)), so every chat switch over a high-latency link — for example a Web client behind `ssh -L` port forwarding — repeats a multi-hundred-message fetch before the transcript appears.

## Decision

`UiWorkspaceService` keeps the `recentSessionsRetained` most recently closed Sessions warm. The bound is this plugin's `Config` field, default 3; 0 restores release-on-switch.

- Warmth is an ordinary reference under the new `recentMain` source declared through `SessionReferenceSourceMap`; `session-controller` gains no cache, policy, or protocol surface.
- `mainView` keeps naming exactly the open Session. Consumers that read `retainedBy.mainView` to find the current selection ([tree current-row marking, shortcuts, ui-session](../../../../packages/client/ui-workspace/src/client/tree.ts)) stay correct because warm references never carry `mainView`. Reusing `mainView` for warm references would make those `find` reads ambiguous.
- A handoff never lets the count reach zero: the incoming role is retained before the outgoing one releases. Reopening a warm Session retains its `mainView` reference first, then drops the warm reference, so the scope and its live stream survive in both directions.
- Archiving a warm Session (locally or through a catalog update) and service disposal release warm references. LRU eviction releases the least recently closed.

## Alternatives considered

- An `afterSeq`/resume opening snapshot, or a durable (IndexedDB) transcript cache, change the wire protocol and the 2026-08-18 snapshot-replacement decision; warmth is client-local policy on existing contracts.
- Dropping the warm `follow` stream while keeping the event window still refetches the opening snapshot on reopen, because there is no resume; keeping the stream is what removes the refetch.
- Host-side prepared-read caching does not shrink wire bytes, the reported cost.

## Consequences

- A warm Session stays subscribed: a running background Session keeps streaming updates to this Client. Idle warm Sessions cost only their retained window (at most the 500-message opening budget plus loaded pages).
- Warmth preserves the transcript, not view state: the Conversation subtree still remounts on switch, so scroll position and component-local state reset. View keep-alive is separate work.
- Reconnect tears down and reopens every retained generation, so N+1 streams resume together; the existing backoff applies.
