# AGENTS.md

## Назначение

`controller` владеет generic controller contracts, module action bridge,
loader data envelope, nearest-runtime context и React hooks
`useController`/`useLoaderData`/`useSubmit`.

## Границы

- Здесь нет конкретных фича controllers.
- Controller token является runtime identity для loader/action data.
- Module action payload хранится в `ModuleRuntime` по исходной ссылке и не
  сериализуется.
- `useFetcher` передаёт route action только одноразовый action id и сохраняет
  React Router lifecycle, policies, cancellation и revalidation.
- Submit state принадлежит runtime и является общим для controller token.
- Loader data читается через публичный hooks, а не через raw DI.
- Widget/frame controller contracts живут в `src/widget` и `src/frame`, но
  view использует единые controller hooks из этого owner.

## Проверка

- Action/data/hooks: локальные tests в `controller/data`, `controller/react`,
  `module/runtime` и `router/runtime`.
- Изменение public hooks: проверить controller runtime context, root exports и
  module/frame/widget consumers.
