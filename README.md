# @sellgar/app

Runtime-фреймворк для frontend-приложений Tiyn: application lifecycle, router,
modules, widgets, frames, dependency injection, policies, guards, revalidation
и встроенные application features.

Публичный API пакета находится в `src/index.ts`. Архитектурная документация и
маршруты для разработки находятся в `docs/README.md` и `AGENTS.md`.

## Использование В Management Panel

Репозиторий подключается как git submodule:

```text
payment-terminal.management-panel.ui/code/library/tiyn-app
```

Пакет остаётся частью Yarn workspace management panel и использует его общий
toolchain. Из каталога `payment-terminal.management-panel.ui/code` доступны:

```bash
yarn test
yarn build:management_panel_ui
```

## Источник Snapshot

Начальное состояние перенесено без истории пакета из:

- репозиторий: `payment-terminal.management-panel.ui`;
- commit: `e1e803a56e2d464b410df7b6f620a67cab249db4`;
- путь: `code/library/tiyn-app`.
