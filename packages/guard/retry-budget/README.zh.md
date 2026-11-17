---
description: "硬性重试预算 guard：限制单步 LLM 重试次数，并可把 agent 切换到备用路由，供选择、配置或排查此插件的用户与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-retry-budget

[English](README.md) | 中文

## 概述

本包界定自动 LLM 重试循环可能造成的代价。重试监听器维护单步尝试计数；超过配置上限后它停止向下委派，于是失败的步骤就此结束，而不是一直重试到服务商自身的（通常高得多的）限制。可选地，否决时它会选定一个备用 provider/model，从而从下一回合起放弃持续失败的路由。`dsh` 基础组合包默认启用本包，单步重试上限 2、无备用路由。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当服务商抖动引发的重试应当便宜且有界时挂载此插件。无需学习或接线：`dsh` 基础组合包已经运行它。本插件必须先于重试监听器（`@deepseek-ai/dsh-llm-retry`）挂载，基础组合包通过行序保证这一点——挂载顺序就是否决机制。

### 何时选择

当被限流或不稳定的路由让默认重试阶梯（每步五次重试、退避递增）主导回合延迟与成本时，选择它。当你的服务商自身重试政策已比该上限更紧时——guard 只会更早停，绝不会更晚——或当每次瞬态失败都必须在服务商允许范围内尽可能重试时，避免使用它。

### 设置上限与备用路由

```yaml
- name: '@deepseek-ai/dsh-retry-budget'
  config:
    maxRetriesPerStep: 2       # retries delegated per step before the step fails
    fallbackProvider: ''       # both set together = route selected on veto
    fallbackModel: ''          # empty (either one) = no fallback, just stop
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `maxRetriesPerStep` | `2` | 每步委派的尝试次数；再次失败即结束该步（每步最多 3 次请求） |
| `fallbackProvider` | `''` | 预算耗尽时选定路由的 provider |
| `fallbackModel` | `''` | 该路由的 model；备用需两个字段都非空 |

无效配置会在启动时失败——非整数或负的 `maxRetriesPerStep`——绝不会静默改变行为。生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-retry-budget)记录每个受支持的值。

### 你会得到什么

一个失败步骤最多消耗 `1 + maxRetriesPerStep` 次请求，随后回合照常以服务商错误结束。配置了备用路由时，否决分支还会记录一条持久化的 model-selection 事件；由于重试循环以冻结的路由运行，切换自下一回合起生效，让 agent 在健康路由上恢复，而不是继续锤击失效路由。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

本节解释否决如何与重试监听器组合；可观察行为在[使用本包](#use-this-package)中已完整覆盖。

### 设计哲学

- **靠顺序否决，不靠改写。** 重试路径是 `agent/request-error` 瀑布：最外层监听器先运行，任何返回决定却不调用 `next()` 的监听器会短路更内层的。挂载在 `llm-retry` 之前，本 guard 在预算耗尽时只是停止委派，`llm-retry` 根本看不到这次失败——没有共享计数器，也没有打补丁的监听器。
- **按步计数。** 重试循环重新驱动同一回合内的同一步，因此尝试按 `(turn, step)` 计数；新回合或新步重置计数，与单个失败步骤该付出多少代价相称。
- **计数从首个请求之后开始。** 首个请求不是重试；尝试 1..N 被委派，第 N+1 次被否决——上限数的是重试次数，不是请求次数。
- **加载即报错。** `maxRetriesPerStep` 在 `apply` 中校验并抛出，绝不回落到默认值。

### 否决与备用路由

`WeakMap<Agent, {turn, step, attempts}>` 保存当前步的预算；每次 `agent/request-error` 计数递增。预算内则向下委派（`next()`），让 `llm-retry` 安排它的退避。超出预算则不返回重试动作——循环抛出 `LlmError`，回合以 `error` 结束。配置了备用路由时，否决分支还会调用 `agent.model.select(fallback)`，追加一条持久的 `model/selection` 会话事件。重试循环以冻结的步选择重新准备请求，因此新路由不用于当前步——它自下一回合起生效，这正是想要的恢复粒度（步中途抖动的路由也正是备用该替换的那条）。

### 源码地图

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` 模式、加载即报错校验、单步预算、否决监听器 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [LLM 流式子系统参考](../../../docs/subsystems/llm-streaming.zh.md)——本预算所界定的重试生命周期（`llm/retry-started`）与失败分类。
- [llm-retry README](../../../packages/llm/llm-retry/README.zh.md)——其重试阶梯被本预算封顶的监听器。
- [生成配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-retry-budget)——每个受支持配置字段及其来源声明。

-----

<a id="model-experience"></a>
## 模型体验

### 被上限截断的重试失败

#### 模型看到什么

没有新内容：被预算否决的步与服务商重试耗尽的步失败方式完全一致——回合以服务商错误结束，模型下次唤醒时看到同样的失败回合状态。guard 不注入任何消息或工具输出。

#### Token 影响

严格少于不设上限的重试：预算耗尽后最多 `maxRetriesPerStep` 次重试响应（每次都是完整请求往返）被跳过。

#### KV Cache 影响

中性；guard 不增加上下文，更早停止使既有 KV-cache 前缀保持不变。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定了本 guard 不适合的场景。它们是当前包的约束，不是任务待办。

- **备用自下一回合生效**——冻结的步选择无法在步中途替换，因此被截断的那一步仍会在旧路由上失败；步内即时切换需要循环用新选择重新准备，这是它有意不做的。
- **加载时不校验备用路由**——启动时不探测备用路由；拼写错误表现为下一回合失败，而非启动错误，因为探测每条路由是服务商的契约，不是 guard 的职责。
- **按 agent 的步记忆**——预算以活的 `Agent` 对象为键；重建的 agent 从头计数，这是内存态可接受的代价。
- **计入所有失败种类**——预算统计重试瀑布看到的任何失败，不只是瞬态失败；永久性错误码本来就更早停止，因为 `llm-retry` 不重试它们。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：尚未决定的开放问题与方向。它明确不具权威性——已交付行为、限制与已接受的理由存于上文本节与包代码中。

对 `llm-retry` 的注册顺序依赖是唯一脆弱的不变量：把 guard 挂在重试监听器之后的组合会静默失去否决权（重试会像 guard 不存在一样跑到服务商上限）。基础组合包的 patch 行序把它编码下来；把挂载顺序上升为清单级依赖会让它变成结构性保证。在单一备用之上再加一级阶梯（首选备用再次失败 → 升级到另一条）是显然的扩展方向。

</details>
