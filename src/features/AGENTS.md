# AGENTS.md

## Назначение

`features` содержит встроенные application runtime features, которые подключаются
через `app.features(...)`.

## Карта

- [notification/AGENTS.md](notification/AGENTS.md) - неблокирующие notifications.
- [user-request/AGENTS.md](user-request/AGENTS.md) - awaitable alert/confirm/prompt.

## Границы

- Feature должен быть framework-level capability, а не business фича.
- Публичные exports идут через feature `index.ts` и затем через `src/index.ts`.
- Runtime, presentation declaration и service interface должны быть разделены.
- Concrete UI presentation предоставляет host application.

## Проверка

- Изменение feature contract: проверить feature docs, `src/index.ts` и host
  потребителей.
