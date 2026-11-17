---
description: "循环卫生 guard 家族的包映射：重复调用提醒与拦截、bash 干等禁令、回合步数上限、单步重试预算与工具调用超时策略，供选择或组合 guard 的用户与维护者阅读。"
kind: "package-group"
---

# guard/：循环卫生 guard 家族

[English](README.md) | 中文

## 概述

`guard/` 组通过观察回合陷入空转或卡死的方式来保持 agent loop（智能体循环）高效。`repeat-tool-reminder` 把模型从完全相同的工具调用循环中提醒出来；`duplicate-call-block` 在同一回合内直接拒绝完全相同的重复；`bash-hygiene` 禁止前台 `sleep` 轮询与完整测试套件运行；`step-budget` 为每回合限步并在上限前发出收尾警告；`retry-budget` 限制每步自动 LLM 重试次数；`timeout-policy` 为声明了限时的工具调用设置超时。六个成员都在 `dsh` 基础组合包中默认启用；组合可以调优或移除它们。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

六个小插件分别覆盖这些空转模式；下文每个 README 都说明何时保留、调优或移除它。

| 包 | 提供什么 |
|---|---|
| [`repeat-tool-reminder/`](repeat-tool-reminder/README.zh.md) | 在模型重复完全相同的工具调用时提醒它，使其改变方法或结束任务 |
| [`duplicate-call-block/`](duplicate-call-block/README.zh.md) | 拒绝同一回合内完全相同的重复，让同一份输出绝不被付费两次 |
| [`bash-hygiene/`](bash-hygiene/README.zh.md) | 拒绝 bash 中的前台 sleep 轮询与完整套件运行，点名合规的等待与测试路径 |
| [`step-budget/`](step-budget/README.zh.md) | 为每回合设步数上限并在上限前发出收尾警告，让卡住的循环从容结束 |
| [`retry-budget/`](retry-budget/README.zh.md) | 限制每步自动 LLM 重试并可切换到备用路由，让服务商抖动保持有界 |
| [`timeout-policy/`](timeout-policy/README.zh.md) | 为声明了限时的工具调用设置超时，让模型得到清晰错误而不是无限等待 |

-----

<a id="related-documentation"></a>
## 相关文档

先从工具子系统参考了解工具调用流水线，再看重复提醒的配置与策略背后的超时库决策。

- [工具子系统参考](../../docs/subsystems/tools.zh.md)——两个 guard 都依赖的工具调用流水线与决策。
- [生成配置目录](../../docs/config-catalog.zh.md#deepseek-aidsh-repeat-tool-reminder)——重复调用提醒的每个受支持字段。
- [超时截止时间库 Agent Note](../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.zh.md)——`timeout-policy` 所执行的时序／终止拆分。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
