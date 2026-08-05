# AGENTS.md

## Назначение

Это корневой маршрут для агентов в `@sellgar/app`.

Пакет содержит framework runtime приложения: application lifecycle, router,
module/widget/frame runtime, DI facade, runtime providers, policies, guards,
revalidate, runtime failures, application events, reporting и встроенные features.

Источник истины: `src/index.ts`, текущий код в `src/*`, тесты рядом с
runtime-срезами и локальные `AGENTS.md` выбранного слоя. `types/` не является
источником истины.

## Быстрый Маршрут

1. Определи слой изменения по карте ниже.
2. Открой локальный `src/<layer>/AGENTS.md`.
3. Проверь публичный экспорт в `src/index.ts`, если меняется внешний контракт.
4. Проверь реализацию и тесты выбранного runtime-среза.
5. Если изменение затрагивает несколько runtime-срезов, открыть каждый локальный
   `AGENTS.md`.
6. Обновить документацию в [docs](docs/README.md), если меняется контракт.

## Карта Слоёв

- [src/application/AGENTS.md](src/application/AGENTS.md) - application lifecycle,
  config, initializers, store, session, events, reporting, disposables.
- [src/router/AGENTS.md](src/router/AGENTS.md) - `Router`, `Route`, runtime,
  params, location/navigate services, search/hash utils.
- [src/module/AGENTS.md](src/module/AGENTS.md) - `@Module`, module metadata,
  lazy export resolution, module runtime.
- [src/widget/AGENTS.md](src/widget/AGENTS.md) - `@Widget`, `WidgetHost`,
  widget runtime, factory, hooks, widget revalidate.
- [src/frame/AGENTS.md](src/frame/AGENTS.md) - `@Frame`, `HashFrameSource`,
  frame navigation, frame service/runtime/hooks.
- [src/runtime/AGENTS.md](src/runtime/AGENTS.md) - runtime scopes, providers,
  operation guards, runtime failures и shared context.
- [src/controller/AGENTS.md](src/controller/AGENTS.md) - generic controller
  contracts, action transport, loader data и route hooks.
- [src/di/AGENTS.md](src/di/AGENTS.md) - DI facade, tokens, binding registry,
  `UseBindings`, injection decorators и Inversify adapter.
- [src/policy/AGENTS.md](src/policy/AGENTS.md) - policy contract,
  descriptors, result handlers и policy runner.
- [src/guard/AGENTS.md](src/guard/AGENTS.md) - guard contract,
  `UseGuards`, runner, hook и `Guarded`.
- [src/layout/AGENTS.md](src/layout/AGENTS.md) - `@Layout` declaration и
  layout rendering.
- [src/revalidate/AGENTS.md](src/revalidate/AGENTS.md) - route/module
  revalidate service и React bridge.
- [src/react/AGENTS.md](src/react/AGENTS.md) - React Router adapter hooks,
  exception context и renderable view helpers.
- [src/reactive/AGENTS.md](src/reactive/AGENTS.md) - реактивные entity
  declarations, identity metadata и внутренняя observable-реализация.
- [src/features/AGENTS.md](src/features/AGENTS.md) - встроенные application
  features.

Встроенные features:

- [src/features/notification/AGENTS.md](src/features/notification/AGENTS.md)
- [src/features/user-request/AGENTS.md](src/features/user-request/AGENTS.md)

## Общие Границы

- Код фич должен импортировать `@sellgar/app`, а не private-файлы.
- Публичный API добавлять только через `src/index.ts`.
- Inversify и React Router должны оставаться за facade/adapter слоями.
- Domain contracts, permissions model, auth-specific recovery, route screens,
  visual business widgets и UI labels здесь не размещать.
- Runtime failure flow является внутренней частью lifecycle owners. Feature-код
  не подписывается на exceptions и не управляет framework disposition.
- Штатные request/session outcomes обрабатывает владеющий ими слой до runtime
  boundary. Transport recovery и health остаются в transport library.
- Новую framework primitive добавлять только при понятной runtime-роли и
  повторяемом сценарии.

## Проверка

- Публичный API или runtime behavior: тесты затронутого слоя и
  `yarn build:management_panel_ui`.
- Router/module/widget/frame изменения: запуск соответствующих `*.test.ts(x)` при
  наличии.
- Только документация: проверить ссылки, соответствие `src/index.ts` и
  `git diff --check`.
