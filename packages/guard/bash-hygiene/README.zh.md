---
description: "硬性拦截的 bash 卫生 guard：拒绝 sleep 轮询与前台完整测试套件运行，供选择、配置或排查此插件的用户与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-bash-hygiene

[English](README.md) | 中文

## 概述

本包阻止模型在 `bash` 工具内浪费回合的两种方式：前台 `sleep` 轮询（什么都不做地干等）与前台运行完整测试套件（让回合挨饿数分钟）。两者都会被拒绝，且拒绝原因会点名合规的替代路径——`wait_agent`、结束回合、`run_in_background` 或选择性测试目标。guard 只观察 `bash` 工具，忽略后台调用，并在匹配前清除引号载荷与注释，因此仅仅提到 `sleep` 的字符串不会被拒绝。`dsh` 基础组合包默认启用本包且两项禁令全开。

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

当模型应当被强制戒除干等与反复跑套件的习惯时，挂载此插件。无需学习或接线：`dsh` 基础组合包已经以两项禁令全开运行它，拒绝原因会当场教会模型替代方案。

### 何时选择

当你的部署中的 agent 靠 `sleep 5 && check` 烧掉回合，或在每次编辑之间同步重跑整个测试套件时，选择它。当前台 sleep 对你的用户是合法工作流时（该禁令是策略，不是普遍法则），或部署没有可指向的替代等待路径时——不给出路的拒绝只会引来重试——避免使用它。

### 开关两项禁令

每项禁令都是独立开关：

```yaml
- name: '@deepseek-ai/dsh-bash-hygiene'
  config:
    banSleepPolling: true      # deny foreground `sleep <n>` usage
    banFullSuiteTests: true    # deny full `pytest`-style suite runs in the foreground
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `banSleepPolling` | `true` | 拒绝用 `sleep <秒>` 干等的前台 bash 命令 |
| `banFullSuiteTests` | `true` | 拒绝未选择子集的前台 pytest 调用 |

### 你会得到什么

被拒绝的调用把拒绝原因作为工具错误返回，而原因会指明确定的出路：sleep 轮询被引导向 `wait_agent`、结束回合或 `run_in_background`；完整套件运行被引导向选择性调用（`path::test`、`-k`、`-m`、`--deselect`）、后台运行或部署的 gate 工具。选择性 pytest 运行、引号数据或注释里的 `sleep`、以及所有后台（`run_in_background: true`）调用都原样通过。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

本节解释 guard 如何读取 bash 调用并作出决定；可观察行为在[使用本包](#use-this-package)中已完整覆盖。

### 设计哲学

- **拒绝而非提醒。** 与兄弟提醒 guard 不同，本包在 `tools/pre-execute` 上否决：干等与跑套件没有有成效的重复次数，循环根本不该执行该调用。
- **每次拒绝都给出路。** 每条拒绝原因都列出合规替代方案，模型一步就能服从，而不是绕着禁令试探。
- **匹配代码而非数据。** 引号载荷与 `#` 注释在匹配前被清空，因此 `grep 'sleep'` 或提到套件的 echo 不会触发禁令。
- **后台永远放行。** `run_in_background: true` 的调用正是禁令希望模型做的事，因此完全跳过检查。

### 检测

- **sleep 轮询**匹配词上下文之外的 `sleep <number>`（`--sleep` 式标志名或 `10sleep` 不匹配）。任何带数字操作数的前台 sleep 都会被拒绝——等待应由模型通过 `wait_agent` 决定，而不是靠挂钟停滞。
- **完整套件 pytest**匹配什么都没选的 `pytest`（或 `python -m pytest`）段：无 `::` 节点 id、无 `-k`/`-m`/`--deselect`/`--collect-only`。以 `;`、`&&`、`||` 或换行连接的命令逐段检查，因此 `pytest a && pytest` 因第二段被拒。
- **参数读取宽容。** 畸形或非对象的参数解析不出命令即放行——工具自身的参数校验仍是权威。

### 源码地图

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` 模式、shell 文本清除、模式检测、拒绝监听器 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [工具子系统参考](../../../docs/subsystems/tools.zh.md)——本 guard 所依赖的 `tools/pre-execute` 瀑布与 `PreToolDecision` 拒绝形态。
- [生成配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-bash-hygiene)——每个受支持配置字段及其来源声明。
- [guard 组地图](../README.zh.md)——兄弟 guard 包与循环卫生家族。

-----

<a id="model-experience"></a>
## 模型体验

### 被拒绝的 sleep 轮询工具结果

#### 模型看到什么

被拒绝的前台 sleep 调用返回以下工具错误而不执行：

##### Sleep 拒绝原因

```markdown
bash-hygiene: foreground `sleep` polling is banned. Waiting with sleep burns the turn while producing nothing. To wait for background work, call `wait_agent` (it returns as soon as a job or agent result arrives) or end your turn and let the completion notice wake you. To run a long command now, start it with `run_in_background: true` and collect it with job tools.
```

#### Token 影响

每次被拒调用一条简短错误结果，取代本应由已完成的 sleep 产生的输出；模型改用 `wait_agent` 后不再有累积。

#### KV Cache 影响

仅追加；拒绝出现在可复用请求前缀之后，不会使现有 KV-cache 条目失效。

### 被拒绝的完整套件工具结果

#### 模型看到什么

被拒绝的前台完整套件运行返回以下工具错误而不执行：

##### 完整套件拒绝原因

```markdown
bash-hygiene: running the full test suite in the foreground is banned. A suite that takes minutes starves the turn and gets re-run on a loop. Instead run only the tests that cover the change (`pytest path/to/test_file.py::test_name` or `-k <expr>`), or start the full suite with `run_in_background: true`, or use the registered acceptance/gate tool if the deployment provides one.
```

#### Token 影响

每次被拒调用一条简短错误结果，取代套件本会流式写入上下文的数分钟转录。

#### KV Cache 影响

仅追加；拒绝出现在可复用请求前缀之后，不会使现有 KV-cache 条目失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定了本 guard 不适合的场景。它们是当前包的约束，不是任务待办。

- **仅限 `bash`**——其他类 shell 工具（运行 `sleep` 的 REPL 终端）按设计不在范围内；禁令集合点名的是两种被观察到的浪费模式，不是通用 shell 政策。
- **模式简单**——把 sleep 藏在变量间接层后的怪shell（`S=sl;eep 5` 或 `$CMD`）不会被检出；guard 在清除注释/引号后匹配字面代码。
- **其他全套件运行器未覆盖**——套件禁令只覆盖 pytest 调用；`npm test`、`go test ./...` 等需要先有按生态的选择器才能公平禁止。
- **无宽限额度**——启用即无条件禁止；先放行后拒绝的许可机制未实现。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：尚未决定的开放问题与方向。它明确不具权威性——已交付行为、限制与已接受的理由存于上文本节与包代码中。

禁令刻意放在可挂载的 guard 里而非核心 `bash` 工具中：该工具自身的 fixture 会合法地使用前台 `sleep`，政策属于组合层而非原语层。若真实部署需要，按命令白名单（例如短于可配置秒数的 sleep 放行）是明显的下一个旋钮。

</details>
