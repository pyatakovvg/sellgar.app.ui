# AGENTS.md

## Назначение

`controller` владеет generic controller contracts, controller invocation,
loader data envelope, nearest-runtime context и React hooks
`useController`/`useLoaderData`/`useSubmit`.

## Границы

- Здесь нет конкретных фича controllers.
- Controller token является runtime identity для loader/action data.
- Controller action вызывается напрямую через nearest runtime; payload
  передаётся по исходной ссылке и не сериализуется.
- `useController` возвращает типизированный facade. Вызов любого метода facade
  проходит через runtime coordinator; raw controller остаётся внутри runtime.
- Submit state принадлежит runtime и является общим для controller token.
- Loader data читается через публичный hooks, а не через raw DI.
- Module/frame/widget используют единый controller runtime port и единые hooks.

## Проверка

- Action/data/hooks: локальные tests в `controller/data`, `controller/react`,
  `module/runtime` и `router/runtime`.
- Изменение public hooks: проверить controller runtime context, root exports и
  module/frame/widget consumers.
