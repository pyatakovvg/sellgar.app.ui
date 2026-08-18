# AGENTS.md

## Назначение

`features/navigation-blocker` — встроенная feature блокировки ухода из текущей
route/frame boundary по условиям application code.

## Границы

- View использует `useBlocker`; controller —
  `NavigationBlockerServiceInterface`.
- Условие отвечает только на вопрос, нужно ли блокировать уход. Не добавлять в
  него `reason`, текст или presentation options.
- Общую presentation предоставляет host application; локальная presentation
  может переопределить её в месте регистрации.
- Feature не зависит от `UserRequestFeature` и не знает его presentation.
- Router bridge мультиплексирует scoped route/frame registrations и остаётся
  внутренней реализацией.
- Browser traversal использует Navigation API pre-commit при его наличии и
  React Router blocker как функциональный fallback.
- `beforeunload` использует нативное browser confirmation.
- Controller обязан освобождать ручную регистрацию; React hook делает cleanup
  сам.

## Проверка

- Runtime: route/frame boundary, независимые FrameRouter, `allow`, cleanup.
- React bridge: pre-commit/fallback traversal, stay/leave и `beforeunload`.
- Публичный API: feature exports, `src/index.ts`, host presentation и
  `docs/20-navigation-blocker.md`.
