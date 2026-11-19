# HISTORY

Хроника обновлений этой ветки: что принёс апстрим между версиями. Личные фичи — в [FEATURES.md](FEATURES.md), процедура слияния — в [UPDATING-GUIDE.md](UPDATING-GUIDE.md).

## Форк-CI: Windows-установщик с личным брендом (2026-11-18, `d0386ad2` → `eb3ca86f`)

Воркфлоу `.github/workflows/desktop-windows-fork.yml`: c 2026-11-18 сборка запускается только тегом `main-<version>` (доверенный коммит), раньше — любым пушем в `main`; на hosted `windows-2025` собирается неподписанный NSIS-установщик (`pnpm run package:desktop:win:x64:unsigned`), бренд `DSH_CLIENT_TITLE=Featured DSH` печётся наравне с локальной Linux-сборкой. VS Build Tools на `windows-2025` есть — `--check` проходит; апстримный `windows-package.yml` не пригоден (self-hosted лейбл `dsh-win-package-trial` и EV-подпись). Зелёный прогон: 44344750233, артефакт ~310 МБ.

Три истинные причины падений по порядку, каждая открывала следующую после починки; до зелёного — шесть прогонов (последняя причина стреляла дважды: до и после неудачной попытки shim-а). Позже добавились ещё две — публикация релиза и локализация бренда, описаны ниже:

1. **`tsc` host-агрегата** (`731ac046`): guard-тесты форка (`5cffdcd4`) никогда не компилировались полным агрегатом — неиспользуемые параметры и `isError: boolean | undefined`. Репродукция локально невозможна (полный `tsc -p tsconfig.host.json` съедает >2 ГБ), источник истины — аннотации CI.
2. **Единство семейства `dsh`** (`822c2940`): `DshFamily.verifyVersions` требует одну версию у всех `packages/*/*` и `apps/*`; личные гарды остались на `0.2.2-rc.1` после merge-forward. Гейт `verify-version-sync` такой рассинхрон не ловит, поэтому версии новых личных пакетов поднимают до корневой вручную.
3. **GNU tar vs bsdtar** (`eb3ca86f`): под `shell: bash` в PATH раньше системного GNU tar из Git-for-Windows; `tar -xOzf D:\a\...` принимает `D:` за remote host:path («Cannot connect to D:»). Апстрим этого не видит: его packaging-джобы идут под pwsh, где `tar` — системный bsdtar. Репозиторийный идиом — tar с `basename` и `cwd` рядом с tarball (`scripts/release/tarball.ts`); `prepare-package-set.ts` его миновал. Попытка shim-шагом подменить bsdtar через `GITHUB_PATH` (`4ec3f441`, отменён) не сработала: упаковщик пересобирает окружение стадий — починка должна быть в коде, не в PATH.

Приём диагностики без прав на логи: логи джоба анонимно 403, аннотации check-run публичны — шаг `if: failure()` печатает `::error::` с хвостами `events.jsonl`/`stderr.log` упаковочного журнала `apps/desktop/.desktop-build/packaging-runs/<timestamp>/` (оставлен в воркфлоу на постоянной основе).

Публикация релиза (`0b2a59cf`) — шаг с `GITHUB_TOKEN` и `permissions: contents: write`: тег `desktop-windows-<version>`, `--prerelease --latest=false`, повторная сборка той же версии — `gh release upload --clobber`. Первый же прогон зелёный: релиз `desktop-windows-0.2.2-rc.3` с ассетом `.exe` 325 МБ.

Локализация бренда (`5ad7fd5d`): `DSH_CLIENT_TITLE_RU`/`_ZH` печатаются в brand-позициях при локали ru/zh — селектор `localizedBrandTitle` (`dsh-client-ui-primitives`) читает `document.documentElement.lang`. Локаль-плагин пишет `lang` до уведомления подписчиков, а смена локали выдаёт новые `t` → оба потребителя (AppFrame, SidebarRoot) перерисовываются и перезапрашивают название. Четвёртая причина падения форк-CI (`a2247c17`): новый devDependency в `ui-layout` без обновления `pnpm-lock.yaml` — `pnpm install --frozen-lockfile` отклоняет рассинхрон; при любой правке `package.json` гонять `pnpm install --lockfile-only` и коммитить блокировку вместе.

## 0.2.2-rc.1 → 0.2.2-rc.3 (merge-forward от 2026-11-17, тег `upstream-0.2.2-rc.3`)

База ветки — апстрим `fcc0ad4` (0.2.2-rc.1). Влита вершина `39163dd3` (1371 коммит, 5645 файлов). Аудированы 32 точки пересечения с личными фичами; все фичи проверены после слияния (test:gui-спекты фич, ci-workflow 74/74, гарды 30/30, presets 53/53, полная сборка 8/8 гейтов).

### Точки аудита и разрешения

- **e2e.yml**: апстрим добавил bubblewrap-cache и ужесточил Preflight до `exit 1`; вилка «skip без ключа» сохранена (ключа DEEPSEEK_API_KEY_EXTERNAL нет и не будет), кеш апстрима взят.
- **ui-workspace README (md/zh)**: сохранён абзац Warm reopen (тёплый кеш из FEATURES.md); формулировка доступа Ungrouped взята из апстрима; дигесты i18n перегенерированы.
- **model-selection**: сообщение вилки со списком разрешённых маршрутов переведено на новый `SubagentError('MODEL_ROUTE_NOT_ALLOWED')` апстрима; тест проверяет обе части.
- **goal**: апстрим не трогал `defaultMaxGoalRounds` — лимит 64 цел.
- **presets**: апстрим не трогал dsh-time-context — вырезка цела; новые апстримные строки (tool-office, interrupt:false, customSkillDirs) приняты.
- **SidebarRoot (brandTitle)**, ** cordis.patch.yml гардов**, **tsconfig-агрегаты**, **AGENTS.md/FEATURES.md/start.sh/UPDATE.md** — вилка целая.

## 0.2.1-rc.3 → 0.2.2-rc.1 (merge-forward от 2026-11-05, тег `upstream-0.2.2-rc.1`)

База ветки — апстрим `22ddee37` (0.2.1-rc.3, 2026-10-23). Влита вершина `fcc0ad4` (0.2.2-rc.1, 2026-11-04): 1914 коммитов, 5252 изменённых файла.

Релизная линия апстрима в этом окне: 0.2.1-rc.4 (26.10) → 0.2.2-alpha.1 (28.10) → 0.2.1-rc.5 (29.10) → 0.2.2-alpha.3 (03.11) → 0.2.2-rc.1 (04.11).

### Мажорные нововведения апстрима

**LiveShare — совместный просмотр сессии DSH.** Новый подсистемный пакет `experimental/liveshare`: хост, viewer и клиентские поверхности расшаривания сессии коллеге; протокол и surface-каталог задокументированы (`docs/subsystems/liveshare.md`).

**Forge — панель change request и worktree-сессии.** Новый subsystem `forge`: просмотр change request, worktree-сессии, список forge-сессий, интеграция с GitHub (`forge-github`), единый плагин-вход для ревью и worktree; карточки изменений и панель — `experimental/client-ui-forge` (`docs/subsystems/forge.md`).

**Agent Teams переработаны.** teammate теперь subagent: командная доступность выбирается на сессию, коммуникация — через subagent-tool поверх всего дерева агентов, inbox-доска задач. Экспериментальные пакеты `agent-team*`/`tool-agent-team` удалены; клиентская часть переехала в `client/ui-agent-team`.

**Менеджер MCP-серверов.** Новый `mcp/mcp-manager`: серверами управляют из страницы настроек, а не только из cordis.yml.

**Computer Use (CUA) собран в optional-бандл.** Согласие на приложение хранят в профиле, добавлены bundle-id-согласие, разделяемый нативный хелпер, dev-подпись; бандл стал on-demand с platform-метаданными (это решение апстрим затем пересмотрел обратно на optional — слитый срез содержит финальный вариант).

**apply_patch для правки файлов.** Новый `fs/fs-patch` + `tool-fs`: аргумент `input` как в Codex, поставка включённой в web-стандартном пресете, observation policy по умолчанию выключена, guard для запуска без policy.

**Снапшоты сессий и пассивные подписки.** Транспорт истории переделан: session snapshot + passive subscription + веб-агрегация (`2026-10-21-session-history-stream-and-snapshot`). На этом механизме работает тёплый кеш закрытых чатов из FEATURES.md — при следующих слияниях проверять его в первую очередь.

**Планировщик.** Standalone schedules: задачи живут отдельно от сессий, интегрированы в WebUI, создание и редактирование объединены, правила хранятся по-новому.

**Контекстные меню.** Новый `client/ui-context-menu` + расширяемый вклад действий (`contextMenus.register`) для сессий, workspace и файлов; `client/ui-file-actions`.

**Провайдеры веб-поиска и fetchа.** Страница настроек разделяет выбор Search и Fetch; Search по умолчанию — DeepSeek Search API.

**Прочее заметное.** Desktop: переключение update-каналов из настроек, staged rollout при публикации, сборка Intel Mac. Клиент: перезапуск после упавших optional-плагинов, восстановление плавающих окон у края экрана, состояние дерева workspace на каждую панель, значки моделей в списке. PTC: evaluation и retention скриптов, сохранение прерываний. SDK: нативные plan/goal/permission/compact-команды через unified query.

### Сломанные изменения апстрима, затронувшие ветку

- Переименование experimental-пакетов без префикса `dsh-experimental-*` (2026-11-04): манифесты и импорты обновлены слиянием.
- Удаление `experimental/agent-team*`: ветка держала старые файлы — подтверждено удаление при аудите.
- `apps/cli` вернул зависимость `cua-bundle` (апстрим откатил on-demand-вариант); веточный `bundles.ts` из squash-снапшота возвращён к финальному варианту апстрима.
- `SESSION_FORMAT_VERSION` остался 4 — старые сессии совместимы.

## Как вести дальше

Следующее обновление: `git log upstream-<последний-тег>..origin/master --no-merges` как отправная точка аудита, новый тег `upstream-<версия>`, запись в этом файле одной секцией выше остальных.
