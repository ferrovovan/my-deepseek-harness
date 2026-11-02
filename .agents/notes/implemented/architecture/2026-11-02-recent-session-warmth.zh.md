# Agent Note：Workspace 导航中的最近 Session 保温

Status: implemented

[English](2026-11-02-recent-session-warmth.md) | 中文

## 问题

释放最后一个 `SessionReference` 会销毁 Client 侧 `Session`：事件窗口和 `follow` 流随之消亡，下一次 `open` 必须重新拉取完整的开场快照。`session.follow` 没有续传游标（见 [Session 历史与事件传输决策](2026-08-18-session-history-and-event-transport.zh.md)），所以在高延迟链路上——例如经 `ssh -L` 端口转发访问的 Web 客户端——每次切换会话都要先重复一次数百消息的拉取，然后才能看到记录。

## 决策

`UiWorkspaceService` 通过 `recentSessionsRetained` 保持最近关闭的若干 Session 处于保温状态。该上限是本插件的 `Config` 字段，默认为 3；设为 0 即恢复"切换即释放"。

- 保温只是普通 reference，使用经 `SessionReferenceSourceMap` 声明的新来源 `recentMain`；`session-controller` 不新增缓存、策略或协议面。
- `mainView` 始终只表示打开中的 Session。以 `retainedBy.mainView` 查找当前选择的消费者（[树当前行标记、快捷键、ui-session](../../../../packages/client/ui-workspace/src/client/tree.ts)）保持正确，因为保温引用从不携带 `mainView`。若保温复用 `mainView`，这些 `find` 读取将产生歧义。
- 交接过程中计数不会归零：先保留进入方的角色，再释放离开方。重新打开保温 Session 时先 retain 其 `mainView` 引用、再丢弃保温引用，两个方向上 scope 与其活跃流都得以存活。
- 归档保温 Session（本地操作或目录快照更新）以及服务释放都会释放保温引用；LRU 逐出释放最久未关闭的那个。

## 备选方案

- 带 `afterSeq`/续传的开场快照或持久化（IndexedDB）记录缓存都会改动线上协议和 2026-08-18 的快照替换决策；保温是既有契约之上的纯客户端策略。
- 丢弃保温的 `follow` 流而保留事件窗口：由于没有续传，重新打开时仍会重新拉取开场快照；保留流才是消除重复拉取的关键。
- Host 侧预读缓存不能减少线上字节数，而线上字节数正是报告的成本。

## 后果

- 保温 Session 保持订阅：后台运行中的会话会持续向本客户端推送更新。空闲的保温 Session 只占用其保留窗口（至多 500 消息的开场预算加已加载分页）。
- 保温保留记录而非视图状态：切换时 Conversation 子树仍会重新挂载，滚动位置与组件局部状态会重置。视图 keep-alive 属于另外的改动。
- 重连会销毁并重开所有保留的 generation，因此 N+1 条流同时恢复；沿用现有退避策略。
