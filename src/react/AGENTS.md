# AGENTS.md

## Назначение

`react` содержит React adapter layer: React Router adapter, route exception
context, pending boundary, navigation/location hooks и
renderable view helper.

## Границы

- React Router internals скрыты за adapter и services.
- Публичный фича code использует hooks/services из корня пакета.
- Adapter code не должен знать business domain или concrete route packages.
- Shared render helpers должны оставаться framework-level.
- Exception context содержит исходную cause для error UI, но не framework
  routing API. React hooks не подписываются на общий error bus.

## Проверка

- Router adapter/hooks: локальные tests в `react/router`.
- Renderable view: tests в `react/view`.
- Проверить `src/router` потребителей при изменении adapter boundary.
