# DeepSeek Harness — 个人分支

[English](README.md) | [Русский](README.ru.md) | 中文

本文另有[俄文版](README.ru.md)。

本仓库是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的个人分支。DeepSeek Harness 是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。本分支在一台个人机器上日常运行该项目，并携带少量个人体验功能。

框架架构未改动：一切皆插件，构建于 [Cordis](https://github.com/cordiverse/cordis) 之上（设计论文见 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)）。完整文档由上游项目维护：[https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)。

## 本分支的改动

个人功能列于 [FEATURES.md](FEATURES.md)；每次更新都以这些功能为基准合并上游，而不是让上游覆盖它们：

- 最近关闭会话的热缓存：切回最近会话时直接从 Client 内存渲染，不再重新拉取历史。上限由 `ui-workspace` 插件配置中的 `recentSessionsRetained` 控制。
- `./start.sh`：systemd 用户服务助手，让 `dsh web` 在终端关闭后持续服务（`start` / `stop` / `restart` / `status` / `logs` / `run`，端口经 `DSH_WEB_PORT` 设置）。

本分支的分支名为 `main`；上游对应 `master`。更新本分支是一次带完整审计的刻意 merge-forward，规程见 [UPDATING-GUIDE.md](UPDATING-GUIDE.md)。

<a id="run"></a>

## 从本分支源码运行

<a id="run-from-source"></a>

```sh
git clone -b main https://github.com/ferrovovan/my-deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物；`pnpm dsh web` 直接使用这些已构建产物，在 `http://127.0.0.1:3080` 提供 Web UI，不会重新构建。传入 `--no-open` 可不打开浏览器。

## 保持后台运行

```sh
./start.sh
```

首次运行会安装并启动 `dsh-web` systemd 用户服务，并打印 Web UI 地址。`./start.sh run` 则让同一服务在前台运行。`./start.sh status` 会重新打印带 `?token=` 查询参数的 URL —— 即访问令牌 —— 因此启动服务的终端关闭后仍可找回链接和令牌。

## 运行上游发行版

已发布的 npm 包由上游维护，不包含本分支的功能：

```sh
npx @deepseek-ai/dsh web
```

## 状态与安全

DeepSeek Harness 处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。** 运行本项目前，请阅读[安全说明](SAFETY.zh.md)。

## 开发

请先阅读上游[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。`pnpm run dev:web` 会在一个终端里完成构建、启动，并在源码修改时重建 client bundle；`make help` 列出 Web 与 Desktop 对应的 Make target。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)，其中的个人分支一节说明了本分支的规则。

## 社区与支持

上游社区渠道：[GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 与 [DeepSeek Harness Discord](https://discord.gg/4MrtZUhpxg)。参与贡献请走上游 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

## 引用

被分支的上游项目：

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
