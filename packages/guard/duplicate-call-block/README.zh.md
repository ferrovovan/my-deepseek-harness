---
description: "硬性拦截 guard：拒绝同一回合内与先前调用完全相同的工具调用，供选择、配置或排查此插件的用户与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-duplicate-call-block

[English](README.md) | 中文

## 概述

本包阻止工具调用空转的最严格形态：同一 agent 在同一回合内重新发出工具名与参数都与先前调用完全相同的调用。重复会被立即拒绝——模型绝不会再次看到它已有的同一份输出——并附带原因，告诉它改变参数、依据先前结果行动或结束任务。拦截按 agent-回合键控，忽略配置的轮询工具（默认为 `wait_agent`、`job_output`、`terminal_read`），并对参数做与顺序无关的比较。`dsh` 基础组合包默认启用本包。

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

当完全相同的重复应当让模型零成本止步、而不是再走一遍相同输出的完整往返时，挂载此插件。无需学习或接线：`dsh` 基础组合包已经运行它，默认豁免表已覆盖重复属有意用法的工具。

### 何时选择

当卡住的模型靠重读同一文件或重跑同一命令拖住回合、而你希望从源头切断重复时，选择它。当完全相同的重复确实返回你必须收集的实时数据时——未列入 `exclude` 的轮询会被拦截——以及你只想要软性提醒而非硬性停止时（那是兄弟包 `repeat-tool-reminder` 的职责，两者可叠加），避免使用它。

### 豁免轮询工具

```yaml
- name: '@deepseek-ai/dsh-duplicate-call-block'
  config:
    exclude: [wait_agent, job_output, terminal_read]  # exact names or `*` wildcards
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `exclude` | `[wait_agent, job_output, terminal_read]` | 完全相同的重复绝不被拦截的工具名模式 |

### 你会得到什么

一个 agent-回合内的第二次完全相同调用会返回点名的工具错误，说明重复毫无增益；首次调用与所有非相同调用原样执行。编辑文件后重读它照样通过（参数不同），带新清单的 `todo_write` 照样通过，新的用户消息开启一个干净回合，其中每个调用又重新获得一次许可。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

本节解释调用如何键控与定界；可观察行为在[使用本包](#use-this-package)中已完整覆盖。

### 设计哲学

- **只拦完全相同。** guard 只拒绝规范化的 `(工具, 参数)` 完全相同的调用；更宽泛的相似仍归建议性 guard 管辖，因此合理的近似重复绝不会被误罚。
- **按回合定界。** 回合是天然单位：有新信息（用户消息）后重发调用是合理的，同一回合内反复锤击不是。
- **在 pre-execute 拒绝。** 被拦调用根本不执行，其成本——执行时间与重复输出 token——被直接省下，这是事后提醒做不到的。
- **与顺序无关的同一性。** 参数在比较前做深度键排序，因此 `{a:1,b:2}` 与 `{b:2,a:1}` 是同一调用；原始字符串参数载荷尽可能重新解析后按值比较，否则按文本比较。

### 键控与范围

- 已见调用的记忆以 `会话 id : lastTurn` 键控，其中 `lastTurn` 来自框架的回合边界投影——即表示用户是否再次发言的同一数值——因此 guard 的回合与模型的回合在构造上就是同一个回合。
- 不携带 agent 的调用共用一个 `'agentless'` 范围（直接 `ctx.tools.execute()` 调用方）；被豁免的工具既不登记也不触发拦截。
- 状态仅在内存中且按回合定界：恢复的会话从头开始，且每个 agent-回合的 `Set` 按设计很小。

### 源码地图

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` 模式、规范化、回合定界、拒绝监听器 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [工具子系统参考](../../../docs/subsystems/tools.zh.md)——本 guard 所依赖的 `tools/pre-execute` 瀑布与 `PreToolDecision` 拒绝形态。
- [repeat-tool-reminder README](../repeat-tool-reminder/README.zh.md)——对近似重复计数提醒、而不拦截完全重复的兄弟包。
- [生成配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-duplicate-call-block)——每个受支持配置字段及其来源声明。

-----

<a id="model-experience"></a>
## 模型体验

### 被拒绝的重复工具结果

#### 模型看到什么

一个回合内的第二次完全相同调用返回以下工具错误而不执行，其中 `<toolName>` 替换为工具名：

##### 重复拒绝原因

```markdown
duplicate-call-block: this exact <toolName> call (identical arguments) already ran earlier in the current turn. Repeating it returns the same result and wastes the turn. Do something different: change the arguments, act on the previous result, or end the turn.
```

#### Token 影响

一条简短错误结果取代该调用本会产生的完整重复输出——只要模型服从，guard 是从上下文中移除 token，而非增加。

#### KV Cache 影响

仅追加；拒绝出现在可复用请求前缀之后，不会使现有 KV-cache 条目失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定了本 guard 不适合的场景。它们是当前包的约束，不是任务待办。

- **只拦完全相同**——改了一个路径或多了一个空格的再读是不同调用，会执行；放宽键会误罚合理的近似重复。
- **不检查结果**——guard 比较的是请求而非输出；值就地刷新的工具（以完全相同参数追读不断增长的日志）需要的是 `exclude` 条目，而不是 guard 的通融。
- **仅同回合范围**——用户消息之后的相同调用即使无意义也放行；把范围扩到整个会话在拿到证据前被否决。
- **无 agent 调用共用一个桶**——没有 agent 的直接执行器调用方彼此去重，这是对该无模型驱动路径可接受的粗糙。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：尚未决定的开放问题与方向。它明确不具权威性——已交付行为、限制与已接受的理由存于上文本节与包代码中。

键的构造与 repeat-tool-reminder 使用同一规范化（深度键排序 + stringify）；尽管辅助函数按包各自复制，两个 guard 有意共享这一同一性概念。按工具的许可计数器（允许 N 次相同调用）是在硬拦截过糙时被认可的、介于本 guard 与提醒之间的折中。

</details>
