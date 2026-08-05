# AGENTS.md

## Назначение

`features/user-request` - встроенные фича awaitable user requests:
alert/confirm/prompt через `UserRequestServiceInterface` и
`UserRequestPresentation`.

## Границы

- Controllers используют `UserRequestServiceInterface`.
- Host application задаёт presentation for alert/confirm/prompt.
- Если presentation не настроен, runtime должен падать явной configuration
  error, а не возвращать default/cancel молча.
- Не добавлять business-specific dialogs или forms.

## Проверка

- Service/runtime/presentation изменения: проверить фича exports и host
  presentation потребителей.
- Публичный API: сверить `src/features/user-request/index.ts` и root
  `src/index.ts`.
