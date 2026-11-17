---
description: "硬性回合步数预算 guard：接近上限时提醒模型收尾，超过上限时拒绝继续步进，供选择、配置或排查此插件的用户与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-step-budget

[English](README.md) | 中文

## 概述

本包为每个回合设定步数的硬性上限。在配置的步数处，每回合注入一条收尾警告，让模型开始有意识地收尾；超过上限后拒绝进一步步进，使回合以 blocked 结束，而不是让卡住的循环无限运行。警告作为带标签的通知搭在该步的消息批次上；拒绝与框架自身的 blocked 回合结果一致。`dsh` 基础组合包默认启用本包，在第 40 步警告、上限 60。

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

当你想把失控回合界定为已知失败模式时挂载此插件——不该结束的循环应消耗固定上限，而不是全部。无需学习或接线：`dsh` 基础组合包已经运行它；若你的正常回合明显更长或更短，调优下面两个数字即可。

### 何时选择

当自主 agent 偶尔进入数百步不结束的步数循环、而你想要一个有预告的保证停止时，选择它。当你的工作负载本就是合法长回合——单回合驱动批量迁移或大范围重构——避免使用它（或调高 `maxSteps`），因为上限是动真格的，会把它们切断。

### 设置上限与警告

```yaml
- name: '@deepseek-ai/dsh-step-budget'
  config:
    warnAt: 40      # 1-based step that receives the one-per-turn wrap-up warning
    maxSteps: 60    # hard ceiling; a step proposed beyond it is rejected
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `warnAt` | `40` | 每回合注入一次收尾警告的步数序号（从 1 起） |
| `maxSteps` | `60` | 每回合步数硬上限；更高的提议步被拒绝且回合结束 |

无效配置会在启动时失败——非整数或小于 1 的值，或 `warnAt` 高于 `maxSteps`（上限之后的警告永远读不到）——绝不会静默改变行为。生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-step-budget)记录每个受支持的值。

### 你会得到什么

到达第 40 步的回合收到一条带标签的警告，告知上限并要它开始收尾；提议第 61 步的回合被拒绝并以 blocked 关闭。提前结束的回合什么都看不到——guard 不给正常回合增加任何上下文，预算随下一回合重置。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

本节解释准入与拒绝如何工作；可观察行为在[使用本包](#use-this-package)中已完整覆盖。

### 设计哲学

- **是上限，不是建议。** 与提醒类 guard 不同，本包行使循环既有的准入否决权：被拒绝的步让回合以 `blocked` 结束，与任何否决监听器产生的结果相同，因此无需新的回合终止机制。
- **先警告后切断。** 警告给模型一段步数窗口，让它从容交付答案，而不是行动到一半被砍；`warnAt` 与 `maxSteps` 之间的间隔就是优雅退出窗口。
- **每回合只警告一次。** 反复警告是模型学会忽略的噪声；`WeakMap<Agent, turn>` 记录哪一回合已被警告。
- **加载即报错。** 两个旋钮及其先后关系在 `apply` 中校验并抛出，绝不回落到默认值。

### 准入流程

guard 监听 `agent/pre-step`，其中 `step` 是循环为下一步提议的从 1 起的序号：

- `step > maxSteps`：不委派、直接返回 `{ kind: 'reject' }`——循环把回合以 `blocked` 关闭。
- `step < warnAt`，或本回合已被警告：原样委派。
- 其余情况：先委派，然后——仅当下游准入（`enter`）时——把警告消息追加到决定的消息批次，因此 guard 绝不替换其他监听器的准入工作。

注入的警告以 source 为 `{kind: 'step-budget', form: 'notice', summary: '<warnAt>/<maxSteps>'}` 的 `user/message` 事件落库，因此可溯源、可从会话日志重建。

### 源码地图

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` 模式、加载即报错校验、pre-step 监听器 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [核心子系统](../../../docs/subsystems/core.zh.md)——回合流程与拦截决定，包括本 guard 所作用的 `agent/pre-step` 准入。
- [生成配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-step-budget)——每个受支持配置字段及其来源声明。
- [guard 组地图](../README.zh.md)——兄弟 guard 包与循环卫生家族。

-----

<a id="model-experience"></a>
## 模型体验

### 收尾警告消息

#### 模型看到什么

在警告步，模型每回合收到一次以下注入通知，计数器按配置值填充：

##### 步数预算警告

```markdown
Step budget: this turn has used <warnAt> of its <maxSteps> allowed steps. The turn will be stopped at step <maxSteps>. Stop starting new work now: fold your remaining actions into at most a few decisive calls, deliver the answer or report what is left and why, and end the turn deliberately rather than being cut off.
```

#### Token 影响

每个被警告回合一条简短消息；在警告步之前结束的回合零成本。

#### KV Cache 影响

仅追加；警告位于可复用请求前缀之后，不会使现有 KV-cache 条目失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定了本 guard 不适合的场景。它们是当前包的约束，不是任务待办。

- **统一上限**——每个 agent 的每个回合预算相同；按 agent 或按预设的上限需要本包不做作用的配置作用域。
- **计步不计时间或成本**——59 步廉价步的回合通过，59 步昂贵步的回合也通过；时间与 token 预算属于其他机制。
- **回合中途无范围重置**——只有新回合重置预算；长工具结果或压缩不会为回合换来更多步数。
- **blocked 回合无强制总结**——被拒回合以 blocked 结束，不注入「报告剩余」消息；警告中的指令是唯一的收尾提示。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：尚未决定的开放问题与方向。它明确不具权威性——已交付行为、限制与已接受的理由存于上文本节与包代码中。

默认数字（40/60）来自被观察的协调者会话：循环在无进展的情况下越过四十步空转。确有合法更长回合的部署应调高两个数字，而不是禁用 guard。若实践中 blocked 回合显得过于沉默，把 blocked 回合升级为强制最终总结请求是合理的后续。

</details>
