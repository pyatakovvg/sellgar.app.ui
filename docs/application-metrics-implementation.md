# Реализация подсистемы метрик

- Статус документа: current
- Source: запрос пользователя «приступай к реализации».
- Контракт: [метрики приложения](../core/application/metric/README.md).
- История решения: [принятый RFC](rfc/application-metrics.md).
- Repository: `@tiyn/app`; branch: `development` (по явному указанию пользователя).
- Base: `origin/development`, `4bb160c669d1764c188828595fba066a8b857a3b` после fetch.
- Profile: L2 — новый public API и поведение одного framework package.
- In scope: core contracts/runtime, DI/lifecycle, React/FSM/Native hooks, tests, docs.
- Out of scope: vendor SDK, реальные запросы, network/retries, persistence, consumer features.
- Approval: явный запрос реализации после согласования RFC; дополнительное подтверждение не требуется.
- Stop boundary: локально реализованный и проверенный framework API; без push, MR и rollout.
- Evidence: invariant checks и regression tests для declaration/validation/routing/queue/lifecycle,
  type fixtures, core/full typecheck, доступные consumer checks.
- Review: один local final review; concurrency/lifecycle требует независимого review перед merge.
  Внешний review tool в текущей сессии отсутствует; локальная реализация не блокируется.
- External state/config: не изменяются. Persistence/schema/shared FE-BE contract: не затрагиваются.
- Исходные unrelated changes: UI/BFF/workspace изменения других задач сохраняются;
  в framework исходно изменены только README и согласованный RFC этой задачи.

## Review Fix Contract

- Source/approval: пользователь поручил исправить подтверждённые дефекты и
  согласовать решения консилиумом субагентов.
- Profile: L2, четыре behavior bugfix внутри `@tiyn/app`; evidence mode —
  regression Red → Green и общий runtime/typecheck/build gate.
- Base: `07f7baa48620086b378b6c9fb3f35b6d8892de36` плюс implementation diff
  `e76565d26f3799d2d881e3c0187106bc7953d68170f3e676ec1ed920ee98512b`.
- Bounded outcome: исключить лишние nested fields и вызовы callable fields;
  исключить вытеснение валидного события невалидным; восстановить DI
  configured subclass. Сохранить routing, snapshot isolation и shutdown budget.
- Owner/coordinator: основная задача; stop boundary — проверенный локальный
  diff на текущем `development`, без commit/push/MR и изменения gitlinks.
- Review: текущие три reviewer contexts используются повторно как owners
  исправлений; итоговый local review объединённого diff выполняет coordinator.
  Между owners выполняется review чужих исправлений. External two-model review
  unavailable: callable provider tool отсутствует; merge gate сохраняется.
- External writes, schema и shared FE/BE contracts не затрагиваются.

| Scope                      | Branch      | Owner                     | Required reading                                     | Evidence                                           |
| -------------------------- | ----------- | ------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| Payload preparation        | development | metric_api_review         | package AGENTS, metric README, accepted RFC          | nested/callable Red → Green                        |
| Validation admission/queue | development | metric_runtime_review     | package AGENTS, metric README, accepted RFC          | invalid overflow/FIFO/bounded preparation/shutdown |
| Configured DI              | development | metric_integration_review | package AGENTS, DI source, metric README             | actual ApplicationScope Red → Green                |
| Docs/integration/closeout  | development | coordinator               | workspace implementation/frontend/multi-agent routes | combined tests/typecheck/build/review              |

## Delivery Contract Delta

- Approval: после отчёта об исправлениях пользователь явно запросил
  «закоммить и запушь изменения в дев фреймворка».
- Новый stop boundary: commit проверенного diff и push непосредственно в
  `@tiyn/app` → `origin/development`. MR, rollout и gitlinks родительских
  репозиториев не входят в этот запрос.
- Перед commit: fetch подтвердил неизменный remote HEAD
  `07f7baa48620086b378b6c9fb3f35b6d8892de36`; scope digest совпал с итоговым
  review digest. Повторные behavior проверки не требуются: код не менялся.
- Прямой push выполняется по явному указанию пользователя. Ограничения Native
  typecheck и недоступность external review остаются зафиксированными ниже;
  эти проверки не объявляются пройденными.

## Current Handoff

- Execution status: complete — local implementation and review fixes
- Owner: текущая задача
- Last verified revisions: `@tiyn/app` — `07f7baa48620086b378b6c9fb3f35b6d8892de36`
  плюс локальный implementation diff. Этот HEAD добавляет ранее согласованный RFC;
  исходная code base остаётся `4bb160c669d1764c188828595fba066a8b857a3b`.
- Open acceptance: none; четыре исходных P2 и дополнительная shutdown race исправлены.
- Current bounded remainder: none; ограничения внешних проверок перечислены ниже.
- Next bounded outcome: отдельная интеграция конкретного SDK по новому запросу.
- Stop boundary: commit и push проверенного diff в `origin/development`
  согласно Delivery Contract Delta.
- Open MRs: none.
- Superseded MRs: none.
- Evidence: 200 tests PASS, дополнительные 43 core tests в Node PASS, core/web/FSM и test
  typechecks PASS, Management Panel build PASS, ESLint/Prettier/diff PASS.
- Review state: local и independent subagent review завершены; external review
  и полный Native typecheck недоступны в текущем окружении. Пользователь
  явно запросил прямой commit/push после отчёта об исправлениях. MR не создаётся.
- Verified at: 2026-10-01.

## Результат

- Core: decorators и contracts, типизация класса события, validation/snapshot,
  маршрутизация по original token, FIFO 150, изоляция ошибок, shutdown 2 секунды.
- Application: configurator, singleton DI service, независимый startup и
  завершение метрик до reporters.
- Renderers: `useMetric` для React/FSM/Native, общий application service без
  дополнительного runtime; StrictMode не создаёт отправки.
- Tests: declaration/preparation, routing/fan-out, out-of-order async validation,
  overflow при initialize и медленном track, failed initialization/DI, отсутствие
  retries, late completion, shutdown deadline, два изолированных приложения.
- Current documentation: [owner README](../core/application/metric/README.md);
  RFC переведён в historical/implemented.

## Проверки

Команды выполнялись из подключающей Management Panel monorepo (`code`), кроме
workspace documentation/inventory checks и `git diff --check` framework repo.

| Проверка                                                                               | Результат                                                                                          |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `yarn workspaces list --json`                                                          | `@tiyn/app` зарегистрирован                                                                        |
| `./node_modules/.bin/tsc -p library/tiyn-app/tsconfig.core.json`                       | PASS, включая metric compile-time fixture                                                          |
| Web/FSM facade и новые test files через временные tsconfig, наследующие package config | PASS; source/manifest/config проекта не подменялись                                                |
| `yarn build:management_panel_ui`                                                       | PASS; стандартное предупреждение о размере vendor chunk                                            |
| ESLint и Prettier по всем task-scoped TS/TSX/docs/config files                         | PASS                                                                                               |
| `git diff --check`, проверка локальных ссылок изменённых документов                    | PASS                                                                                               |
| `./scripts/check-doc-navigation.sh` из workspace                                       | FAIL: пять существовавших до задачи ссылок в `oop-runtime-contract.md` на удалённые framework docs |
| `./scripts/status-all.sh`, `git submodule status --recursive`                          | Все submodules инициализированы; unrelated workspace pointers не изменялись этой задачей           |

Регрессионная команда после review fixes — **29 файлов, 200 тестов PASS**:

```sh
./node_modules/.bin/vitest run \
  library/tiyn-app/core/application \
  library/tiyn-app/react/application \
  library/tiyn-app/fsm/application \
  library/tiyn-app/shared/application/feature \
  library/tiyn-app/native/application/metric \
  library/tiyn-app/native/application/reporting
```

Дополнительная проверка renderer-independent core без DOM — **3 файла,
43 теста PASS**:

```sh
./node_modules/.bin/vitest run \
  library/tiyn-app/core/application/metric \
  library/tiyn-app/core/application/lifecycle/application/application-metric.test.ts \
  --environment node
```

## Ограничения окружения

- `yarn workspace @tiyn/app typecheck:core` и `typecheck` не находят `tsc` в
  workspace PATH; локальный бинарник monorepo доступен и использован напрямую.
- Полный package typecheck до изменений уже не проходил: в Management Panel
  отсутствуют optional Native peers. Пробная проверка с доступными внешними
  RN 0.87.1 types оставляет ошибки в неизменённом Native `shell-scroll-view`.
  Это не PASS полного facade; требуется совместимое штатное Native окружение.
- Доступный отдельный Admin UI использует legacy public API (`Application`,
  hooks и другие renderer exports из корня `@tiyn/app`). Проверка с текущим
  framework выявляет несовместимость существующего consumer, не metric API.
- Доступный Mobile Shop уже использует `@sellgar/app/native`, поэтому его
  обычный typecheck не проверяет этот checkout `@tiyn/app` и не засчитывается.
  Native metric hook проверен runtime-тестом и typecheck новых tests.
- Реальные SDK, внешние приёмщики, физические устройства и browser delivery
  не проверялись: они не входят в текущий framework outcome.

## Review

- Scope: только `@tiyn/app`, tracked diff и новые файлы относительно
  `07f7baa48620086b378b6c9fb3f35b6d8892de36`; этот execution evidence document
  исключён из digest, чтобы обновление evidence не меняло identity кода.
- Начальный review scope SHA-256 (tracked + new files):
  `e76565d26f3799d2d881e3c0187106bc7953d68170f3e676ec1ed920ee98512b`.
- Итоговый scope SHA-256:
  `b4a6ad8466bc76e581e131425006f2faecc45540e183921cd1fd0c23c6e033fa`.
- Local final review: coordinator проверил объединённый production diff после
  принятых semantic fixes. Незакрытых actionable findings нет.
- Independent review: три существующих subagent contexts, модель унаследована
  от coordinator; API/preparation, runtime и integration/DI scopes. Исправления
  обсуждены между owners; preparation дополнительно проверил integration owner,
  runtime — API owner с независимым Red → Green для shutdown race.
- External two-model review: unavailable, соответствующий callable tool
  отсутствует; source внешним providers не отправлялся. Subagent review не
  выдаётся за отдельный external provider gate до merge.

| Finding                                          | Discovered by             | Validated by          | Disposition                                             | Fix/evidence                                                              |
| ------------------------------------------------ | ------------------------- | --------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| P2: nested extra fields in payload               | metric_api_review         | coordinator           | accepted, fixed                                         | declaration projection; preparation nested/array/default/record tests     |
| P2: callable fields executed in serialization    | metric_api_review         | coordinator           | accepted, fixed                                         | own-data serialization; Red 2 failures → Green                            |
| Дополнительный getter path через обычный Expose  | metric_integration_review | metric_api_review     | accepted, fixed                                         | no expose/exclude field discovery; Red 1 failure → preparation 13/13      |
| P2: invalid event evicts valid entry             | coordinator               | metric_runtime_review | accepted, fixed; повторное finding reviewer — duplicate | success-only admission; 149 → 150 delivered                               |
| P2: configured subclass loses DI                 | metric_integration_review | coordinator           | accepted, fixed                                         | public injectFromBase; actual Application tests 8/8                       |
| P2: shutdown misses restarted preparation worker | metric_api_review         | metric_runtime_review | accepted, fixed                                         | current-worker wait loop; production regression + independent Red → Green |

Все fixes включаются в единый implementation commit по Delivery Contract Delta.
Regression tests принадлежат production owners и не зависят от временных probes.
Scope handoffs всех трёх owners приняты координатором; итоговый combined gate
200/200 и Node gate 43/43 выполнены после последних semantic fixes.

## Принятые решения исправлений

- Typed nested DTO фильтруются рекурсивно; обычные records сохраняют свои ключи.
  Явные input `@Type`/`@Transform` сохранены. Сериализация использует own data
  descriptors и не выполняет методы/getters. Input preprocessing остаётся
  `class-transformer`, поэтому произвольные accessors/constructors/transforms
  моделей не изолированы от побочных эффектов; модели должны быть чистыми DTO.
- Подготовка и delivery имеют общий предел 150 ожидающих записей на получателя;
  текущая подготовка и текущая отправка учитываются отдельно. При насыщении
  подготовки отбрасывается новое событие; при полной delivery queue успешно
  проверенное событие вытесняет самое старое. Невалидное событие не вытесняет
  validated data. Snapshot, FIFO и независимость получателей сохранены.
- Наследование DI использует public Inversify API. Для собственного конструктора
  с другим набором параметров есть `inheritConstructorArguments: false`.
  Эвристика `design:paramtypes` отклонена: фактический SWC pipeline её не выдаёт.
- Shutdown отслеживает смену preparation worker в completion microtask в пределах
  прежнего общего бюджета 2 секунды. Ошибка подготовки содержит event name.
