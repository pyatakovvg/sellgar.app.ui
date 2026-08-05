# AGENTS.md

## Назначение

`controller` владеет generic controller contracts, action transport,
loader data envelope, nearest-runtime context и React hooks
`useController`/`useLoaderData`/`useSubmit`.

## Границы

- Здесь нет конкретных фича controllers.
- Controller token должен быть stable key для loader/action data.
- Action transport serializes controller key, submit id и payload.
- Loader data читается через публичный hooks, а не через raw DI.
- Widget/frame controller contracts живут в `src/widget` и `src/frame`, но
  view использует единые controller hooks из этого owner.

## Проверка

- Action/data/hooks: локальные tests в `controller/action`, `controller/data`,
  `controller/react`.
- Изменение public hooks: проверить controller runtime context, root exports и
  module/frame/widget consumers.
