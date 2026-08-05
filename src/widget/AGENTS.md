# AGENTS.md

## Назначение

`widget` владеет `@Widget`, `WidgetDefinition`, `WidgetHost`, widget runtime,
state machine, runtime factory, props/loader/action access и widget-local
runtime wiring.

## Границы

- Widget token должен наследовать `WidgetDefinition<TProps>` для typed props.
- `WidgetHost` создаёт или использует prepared runtime по owner scope,
  widget token и `runtimeKey`.
- `RevalidateServiceInterface` внутри widget scope обновляет только
  widget-local loader data.
- Visual business widgets живут в `widgets/*`, не здесь.
- Route/module/frame runtime не подменять widget runtime scope.

## Проверка

- Widget runtime/factory/state machine: локальные tests в `widget/runtime`.
- React hooks/host: tests в `widget/react`.
- Публичный contract: сверить `src/index.ts` и docs `../../docs/05-widgets.md`.
