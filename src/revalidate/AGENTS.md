# AGENTS.md

## Назначение

`revalidate` владеет единым `RevalidateServiceInterface`, runtime-local
реализацией, application-level registry service, React bridge и `useRevalidate`.

## Границы

- `RevalidateServiceInterface` является единым DI token для module/frame/widget.
- Конкретная реализация выбирается ближайшим runtime scope.
- Route-level `RevalidateServiceInterface` регистрирует invalidation intent в
  application-scoped runtime coordinator. React adapter подключает к нему ровно
  один refresh handler.
- Action не запускает неявный post-action revalidate. Обновление данных после
  mutation является явным use-case решением через `RevalidateServiceInterface`.
- Navigation не должна использоваться как замена revalidate.

## Проверка

- Service/bridge/hook изменения: локальные tests в `revalidate/*`.
- Проверить потребителей в module/frame/widget controllers и docs
  `../../docs/08-policies-revalidate-errors.md`.
