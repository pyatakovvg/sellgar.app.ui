# AGENTS.md

## Назначение

`module` владеет `@Module`, module metadata, lazy export resolution и module
runtime для route-level screens.

## Границы

- `@Module` описывает view, controllers, providers и exception UI.
- Route imports должны резолвить module через package публичный export.
- Module runtime управляет loader/action lifecycle, providers и cleanup.
- Конкретные route screens в `modules/*` сюда не переносить.
- Controller contracts живут в `src/controller`, shared runtime providers - в
  `src/runtime`.

## Проверка

- Module runtime/resolution: локальные tests в `module/runtime` и
  `module/resolution`.
- Изменение metadata: сверить docs `../../docs/04-modules-controllers-providers.md` и
  package structure docs.
