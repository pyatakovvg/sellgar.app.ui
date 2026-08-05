# AGENTS.md

## Назначение

`frame` владеет `@Frame`, `FrameDefinition`, shell contract, frame source,
`HashFrameSource`, frame navigation state, frame runtime, frame service и React
hooks.

## Границы

- Потребители открывают frame через `useFrame(...)` или `FrameServiceInterface`.
- Hash key принадлежит `FrameSourceInterface`/`HashFrameSource`, а не потребителю.
- Frame navigation history хранится в `frame-navigation-state` в
  `sessionStorage`, с областью по `router.baseUrl`.
- `history.state` не является источником истины для frame history.
- Frame revalidate локален к активному frame instance.
- Drawer/modal presentation принадлежит frame shell или package-потребителю, не core
  runtime.

## Проверка

- Frame source/runtime/service/navigation: локальные tests в `frame/*`.
- Изменение history/hash поведение: проверить docs `../../docs/06-frames.md` и audit.
- Публичный contract: сверить `src/index.ts`.
