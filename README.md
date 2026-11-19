# DeepSeek Harness — personal fork

English | [Русский](README.ru.md) | [中文](README.zh.md)

A personal fork of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`), the open-source agent harness developed by [DeepSeek AI](https://deepseek.com). The upstream project owns the product; this fork runs it daily on one machine and carries a small set of personal quality-of-life features.

Harness architecture is unchanged: everything is a plugin, built on [Cordis](https://github.com/cordiverse/cordis) ([design paper](https://arxiv.org/abs/2608.25512)). Full documentation lives upstream: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/).

## What this fork changes

Personal features are listed in [FEATURES.md](FEATURES.md), and every update merges upstream around them instead of over them:

- Warm cache of recently closed chats: switching back to a recent chat renders from Client memory instead of refetching the transcript. Bound by `recentSessionsRetained` in the `ui-workspace` plugin config.
- `./start.sh`: systemd user-service helper that keeps `dsh web` serving after the terminal closes (`start` / `stop` / `restart` / `status` / `logs` / `run`, port via `DSH_WEB_PORT`).

The fork branch is `main`; upstream tracks `master`. Updating this fork is a deliberate merge-forward with a full audit, owned by [UPDATING-GUIDE.md](UPDATING-GUIDE.md).

<a id="run"></a>

## Run this fork from source

<a id="run-from-source"></a>

```sh
git clone -b main https://github.com/ferrovovan/my-deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts; `pnpm dsh web` serves the Web UI at `http://127.0.0.1:3080` from those artifacts without rebuilding. Pass `--no-open` to skip opening a browser.

## Keep it running

```sh
./start.sh
```

The first run installs and starts the `dsh-web` systemd user service and prints the Web UI URL. `./start.sh run` keeps the same server in the foreground instead. `./start.sh status` reprints that URL with its `?token=` query — the access token — which is how you recover the link and token after the terminal that started the service is gone.

## Run the upstream release

The published package is upstream-owned and does not contain this fork's features:

```sh
npx @deepseek-ai/dsh web
```

## Status and safety

DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.** Review the [safety notice](SAFETY.md) before running the project.

## Development

Start with the upstream [development guide](docs/development.md) and [architecture documentation](docs/architecture.md). `pnpm run dev:web` builds, serves, and rebuilds client bundles on source edits in one terminal; `make help` lists the matching Make targets.

For agents, follow [AGENTS.md](AGENTS.md); its personal-fork section states the fork rules.

## Community and support

Upstream community channels: [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) and the [DeepSeek Harness Discord](https://discord.gg/4MrtZUhpxg). Contribute upstream through [CONTRIBUTING.md](CONTRIBUTING.md).

## Citation

The project being forked:

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
