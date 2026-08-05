# AGENTS.md

## Назначение

`revalidate` владеет единым `RevalidateServiceInterface`, runtime-local
реализацией, application-level registry service, React bridge и `useRevalidate`.

## Границы

- `RevalidateServiceInterface` является единым DI token для module/frame/widget.
- Конкретная реализация выбирается ближайшим runtime scope.
- `RevalidateBridge` связывает application-level registry с active route runtime.
- Navigation не должна использоваться как замена revalidate.

## Проверка

- Service/bridge/hook изменения: локальные tests в `revalidate/*`.
- Проверить потребителей в module/frame/widget controllers и docs
  `../../docs/08-policies-revalidate-errors.md`.
