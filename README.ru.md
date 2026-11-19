# DeepSeek Harness — личная ветка

[English](README.md) | Русский | [中文](README.zh.md)

Это личная ветка [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) — открытого агентского харнесса от [DeepSeek AI](https://deepseek.com). Продуктом владеет апстрим; эта ветка запускает его на одной личной машине и несёт небольшой набор личных удобств.

Архитектура харнесса не изменена: всё есть плагин, всё построено на [Cordis](https://github.com/cordiverse/cordis) ([статья об дизайне](https://arxiv.org/abs/2608.25512)). Полная документация живёт в апстриме: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/).

## Что меняет эта ветка

Личные фичи перечислены в [FEATURES.md](FEATURES.md); каждое обновление вливает апстрим вокруг них, а не поверх них:

- Тёплый кеш недавно закрытых чатов: переключение на недавний чат рендерится из памяти клиента, без повторной подгрузки истории. Ограничение задаётся полем `recentSessionsRetained` в конфиге плагина `ui-workspace`.
- `./start.sh`: systemd-хелпер, который оставляет `dsh web` висеть после закрытия терминала (`start` / `stop` / `restart` / `status` / `logs` / `run`, порт через `DSH_WEB_PORT`).

Личная ветка живёт в `main`; апстрим отслеживается в `master`. Обновление этой ветки — осознанный merge-forward с полным аудитом, регламент в [UPDATING-GUIDE.md](UPDATING-GUIDE.md).

<a id="run"></a>

## Запуск этой ветки из исходников

<a id="run-from-source"></a>

```sh
git clone -b main https://github.com/ferrovovan/my-deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` готовит артефакты репозитория; `pnpm dsh web` раздаёт Web UI на `http://127.0.0.1:3080` из этих артефактов без пересборки. Флаг `--no-open` отключает открытие браузера.

## Держать сервис в фоне

```sh
./start.sh
```

Первый запуск устанавливает и поднимает systemd-пользовательский сервис `dsh-web` и печатает URL Web UI. `./start.sh run` оставляет тот же сервер на переднем плане. `./start.sh status` печатает состояние сервиса и его последний URL — вместе с query-параметром `?token=`, то есть токеном доступа; так можно восстановить ссылку и токен, когда терминал, запустивший сервис, уже закрыт.

## Запуск релиза апстрима

Опубликованный в npm пакет принадлежит апстриму и не содержит фич этой ветки:

```sh
npx @deepseek-ai/dsh web
```

## Статус и безопасность

DeepSeek Harness находится в _developer preview_ и быстро меняется. **БУДУТ ЛОМАЮЩИЕ СОВМЕСТИМОСТЬ ИЗМЕНЕНИЯ.** Перед запуском прочитайте [предупреждение о безопасности](SAFETY.md).

## Разработка

Начните с апстрим-[руководства разработчика](docs/development.md) и [документации по архитектуре](docs/architecture.md). `pnpm run dev:web` собирает, поднимает сервер и пересобирает клиентские бандлы по правкам в одном терминале; `make help` печатает соответствующие Make-цели.

Для агентов — [AGENTS.md](AGENTS.md); его раздел «Личный форк» формулирует правила ветки.

## Сообщество и поддержка

Каналы апстрима: [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) и [Discord DeepSeek Harness](https://discord.gg/4MrtZUhpxg). Контрибьют идёт в апстрим через [CONTRIBUTING.md](CONTRIBUTING.md).

## Цитирование

Проект, от которого сделан форк:

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## Лицензия

[MIT](LICENSE)

Сторонние зависимости и их лицензии перечислены в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
