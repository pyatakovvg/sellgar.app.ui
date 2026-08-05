# AGENTS.md

## Назначение

`features/notification` - встроенные фича неблокирующих уведомлений:
`NotificationFeature`, `NotificationPresentation`, `NotificationServiceInterface`,
`useNotification` и view props.

## Границы

- Controllers используют `NotificationServiceInterface`.
- Host application задаёт presentation через `NotificationPresentation`.
- Runtime управляет очередью/timer state, но не business content.
- Не экспортировать registry, bindings, runtime classes или exceptions без
  отдельной необходимости.

## Проверка

- Service/runtime/presentation изменения: проверить фича exports и host
  presentation потребителей.
- Публичный API: сверить `src/features/notification/index.ts` и root
  `src/index.ts`.
