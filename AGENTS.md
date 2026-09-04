# AGENTS.md

Общие правила пакетов:
[docs/agent/package-common.md](../../docs/agent/package-common.md).

## Структура

- Общего каталога `src` нет.
- `core`, `react`, `native` и `fsm` — entrypoint-части одного package.
- Public imports определяются только `package.json#exports`; deep imports
  запрещены.
- Внутри entrypoint код сначала группируется по framework-домену (`router`,
  `application`, `module`), затем по роли (`declaration`, `runtime`, `service`),
  затем по конкретному owner. Implementation-файлы непосредственно в корне
  entrypoint запрещены.
- Каждый конкретный owner имеет локальный facade-файл; public entrypoint явно
  выбирает из owner facades только публичный контракт.
- Самостоятельный owner импортируется через его каталог. Путь к локальному
  `index.ts`/`index.tsx` никогда не указывается напрямую; конкретный
  implementation-файл разрешено импортировать только изнутри того же owner.
- Внутренняя структура создаётся вместе с реализацией, а не заранее.
- Общий каталог тестов не используется; тест принадлежит конкретному owner.

## Границы

- `@sellgar/app` является единственным источником framework runtime и разделён
  на core, renderer adapters и router bridges.
- Если RFC явно не фиксирует semantic delta, сохраняются согласованные публичный
  контракт, порядок lifecycle, ownership, error handling и cleanup.
- Core не импортирует React, React DOM, React Router или React Native.
- Renderer adapter использует один core lifecycle и не создаёт второй runtime.
- Router bridge реализует core navigation ports и не владеет logical navigation
  state.
- Renderer-specific declarations, hosts, hooks и presentation types не попадают
  в core source и core `.d.ts`.
- Entry points не импортируют private implementation друг друга через package
  boundary; общий код принадлежит core или явному shared owner.

## Проверка

- `yarn workspaces list --json` показывает `@sellgar/app`;
- TypeScript разрешает все объявленные entrypoints;
- Prettier и `git diff --check` проходят;
- Admin UI собирается и проходит active test suite на `@sellgar/app`.
