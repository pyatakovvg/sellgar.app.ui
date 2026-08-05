# AGENTS.md

## Назначение

`application` владеет lifecycle приложения, config, initializers, application
store, session runtime state, application event bus, reporting, disposables и
application features.

## Границы

- Публичные exports идут через `src/index.ts`.
- `Application` управляет `compose`, `initialize`, `createView`, `dispose` и
  application scope.
- `SessionRuntimeStateInterface` хранит только phase/revision сессии.
- `ApplicationStoreInterface` хранит resolved application-level data.
- Initializer получает signal и disposable registry, но не глобальную подписку
  на runtime failures. Session/request recovery подключается к контракту
  request/session owner.
- Auth-specific recovery и profile semantics принадлежат host/domain слоям.
- Feature-specific state, route logic, widgets и frame поведение здесь не
  размещать.

## Проверка

- Lifecycle/config/initializer: тесты `application/lifecycle` и затронутый код.
- Store/session/event bus/reporting: соответствующие локальные тесты при
  наличии.
- Публичный экспорт: проверить `src/index.ts` и потребителей.
