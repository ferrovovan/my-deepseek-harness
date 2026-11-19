# FEATURES

Личные фичи этого форка. При обновлении с апстрима каждая позиция здесь важнее изменений апстрима: сначала проводится тщательный аудит обновления (см. [UPDATING-GUIDE.md](UPDATING-GUIDE.md)), затем изменения апстрима подгоняются под эти фичи, а не наоборот.

## Тёплый кеш закрытых чатов

`packages/client/ui-workspace` — LRU закрытых `SessionReference` (источник retain `recentMain`, лимит `Config.recentSessionsRetained`, по умолчанию 3). Переключение между чатами не рвёт follow-стрим и не тянет историю заново.

## start.sh

systemd-хелпер запуска `dsh web` в фоне; остаётся в корне репозитория.

## CI без реальных API-ключей

Этот форк не хранит секрет `DEEPSEEK_API_KEY_EXTERNAL`. Апстримные жёсткие preflight-падения при отсутствии ключа — `.github/workflows/e2e.yml` (джоб `e2e`) и `.github/workflows/build-exe-for-python-sdk.yml` (шаги `Preflight installed-wheel real API test`) — заменены на корректный skip: отдельная проверка публикует `has_key`, джобы/шаги реальных API-тестов выполняются только при `has_key=true`, иначе пропускаются с `::notice::`. Кластер keyless-гейтов (ci.yml, ci-windows.yml, coverage, snapshot) не затронут. Ручной workflow `pi-ai-provider-e2e.yml` оставлен как есть: он запускается только вручную и без своих ключей обязан падать. Если ключ когда-нибудь появится, достаточно завести repo secret — файлы трогать не нужно. При слиянии апстрима оставлять версию форка (skip), не апстримную (hard-fail).

## Личные гарды и лимиты агента

Группа `packages/guard/` дополнена четырьмя пакетами, которых в апстриме нет; они подключены в базовом профиле (`packages/bundle/base/cordis.patch.yml`), описаны в `docs/config-catalog.md(.zh)` и в README группы:

- `@deepseek-ai/dsh-step-budget` — жёсткий потолок шагов хода: предупреждение модели у потолка (`warnAt: 40`) и отказ шагов после него (`maxSteps: 60`).
- `@deepseek-ai/dsh-retry-budget` — потолок LLM-ретраев на шаг (`maxRetriesPerStep: 2`); монтируется до `llm-retry`, чтобы оставаться внешним слушателем ошибок запроса (порядок waterfall = порядок регистрации).
- `@deepseek-ai/dsh-duplicate-call-block` — отказ инструментального вызова, точно повторяющего предыдущий в том же ходе. Апстримный мягкий аналог — напоминание `repeat-tool-reminder`; при слиянии остаются оба: напоминание апстрима, блокирующий гард форка.
- `@deepseek-ai/dsh-bash-hygiene` — отказ sleep-поллинга и прогона полного тестового набора на переднем плане в bash.

Личные лимиты и диагностики в апстримных файлах: в `packages/goal/goal` `defaultMaxGoalRounds` понижен с 256 до 64; в `packages/subagent/tool-subagent` отказ неразрешённого маршрута перечисляет разрешённые маршруты вместо бесплодного «not allowed» (модель получает точный выбор или указание опустить provider/model для наследования родительского).

## Своё название продукта при сборке

Апстримный механизм `DSH_CLIENT_TITLE` (build-time переменная из `scripts/client-build-environment.ts`, официальные артефакты фиксируют `DeepSeek Harness`) в форке доведён до brand-фолбэка сайдбара: `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` берёт заголовок фолбэка через `localizedBrandTitle` из `packages/client/ui-primitives/src/brand-title.ts` (как и `productTitle` в `AppFrame`), а не жёстко локаль `brand.localBuild`. Способ: собрать с `DSH_CLIENT_TITLE="Моё Название" pnpm run build` (или `DSH_CLIENT_TITLE=... pnpm run dev:web`) — название попадает в заголовок вкладки (vite), productTitle рамки и бренд сайдбара; без переменной остаётся «Локальная сборка DSH» по локалям. Локализация названия: дополнительные build-time переменные `DSH_CLIENT_TITLE_RU` и `DSH_CLIENT_TITLE_ZH` печатаются в brand-позициях при активной локали ru/zh — селектор читает `document.documentElement.lang` (его locale-плагин пишет до уведомления подписчиков, а смена локали выдаёт новые `t` и перерисовывает потребителей), при отсутствии варианта или другой локали — общий `DSH_CLIENT_TITLE`, затем локаль `brand.localBuild`; в форке CI Windows это `Featured DSH` / `Изменённый DSH` / `定制 DSH`. Профиль `official` неизменён — он обязан держать точное `DeepSeek Harness` (гейт `assertClientBuildEnvironment`). Правка форка в `resolveClientBuildEnvironment`: `local`-профиль сохраняет переданные `DSH_CLIENT_TITLE`, `DSH_CLIENT_TITLE_RU`, `DSH_CLIENT_TITLE_ZH` (апстрим выбрасывал), поэтому `DSH_CLIENT_TITLE=... pnpm run build --profile local` — путь неподписанных desktop-сборок (`package-target.ts`) — печёт те же названия; тесты в `client-build-environment.client.spec.ts` («retains local branding») и `ui-primitives/tests/brand-title.client.spec.ts`. При слиянии апстрима сохранять форк-версию строк `brandTitle`/`productTitle` и эту ветку local-профиля.

## Отслеживание мажорных нововведений апстрима

Репозиторий отслеживает мажорные нововведения оригинальной команды — это личная фича удобства, а не изменение апстрима. Каждое обновление записывает что принёс апстрим в [HISTORY.md](HISTORY.md) одной секцией выше остальных; слитый срез апстрима фиксируется SHA апстримного коммита в HISTORY.md (теги форка не используются — теги зарезервированы за доверенными сборками), от этого среза стартует аудит следующего слияния. При аудите пересечение с личной фичей остаётся точкой приоритета личной фичи, а нововведение апстрима не считается потерянным молча: оно либо вошло в ветку, либо осознанно отброшено с записью в HISTORY.md.

## Доверенная сборка Windows-установщика по тегу

Форк CI (`.github/workflows/desktop-windows-fork.yml`) собирает неподписанный `.exe` ТОЛЬКО при пуше тега `main-<version>` — сам тег выражает доверие к коммиту; обычные пуши в `main` сборку не запускают (заготовочные `main-pre-update-*` исключены из триггера явным отрицанием). Релиз attach-ится к тегу-триггеру (`gh release create "$GITHUB_REF_NAME" --prerelease --latest=false`, повтор прогона — `--clobber`), публикация идёт штатным `GITHUB_TOKEN` (`permissions: contents: write`) — личных секретов нет. Теги в форке не копятся: перед пересборкой старого удаляются, шаг публикации зачищает legacy-релизы `desktop-windows-*`.
