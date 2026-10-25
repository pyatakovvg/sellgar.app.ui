# Виджеты FSM-среза

- Статус документа: current

FSM использует тот же core WidgetRuntime, WidgetRuntimeRegistry и
WidgetPreloaderInterface, что и остальные срезы. В этом каталоге находятся только
декларация и React-renderer-интеграция с контекстами FSM.

Публичный API доступен через `@sellgar/app/fsm`:
`Widget`, `WidgetDefinition`, `WidgetHost`, `useWidgetProps`,
`WidgetPreloaderInterface` и соответствующие типы.

```tsx
@UseBindings(KeyboardBindings)
@Widget({ view: WidgetView, providers: [KeyboardProvider] })
export class KeyboardWidget extends WidgetDefinition {}

// Во view владельца:
<WidgetHost token={KeyboardWidget} />;
```

Controller bindings принадлежат виджету. Его view использует обычные FSM hooks
`useLoaderData`, `useController` и `useSubmit`. Application feature controllers
по-прежнему разрешаются через feature runtime, а не через runtime виджета.

## Lifecycle

- Host получает registry из текущего FSM scope. Идентичность экземпляра:
  owner scope + widget token + необязательный runtimeKey.
- Core отвечает за загрузку controllers/providers, actions и disposal;
  renderer не создаёт второй lifecycle.
- Если виджет нужен до первого экрана, runtime provider владельца вызывает
  `widgets.preload(context, WidgetToken)` в `prepare` и возвращает полученный
  cleanup. Пока preload не завершён, старт приложения остаётся на splash.
- Preload и host должны использовать одинаковые owner scope, token и runtimeKey.
  Тогда mount использует подготовленный instance без повторной загрузки.
- Без явного preload host начинает загрузку при mount и не рисует содержимое
  до готовности. У FSM Widget нет настройки `fallback`. Если виджет должен
  появиться вместе с экраном, владелец включает его в preload маршрута.
- Обновление props использует существующий core runtime. StrictMode replay
  не создаёт параллельный instance. При исчезновении последнего владельца
  core освобождает runtime и ресурсы.
- Loader/provider и render failures показывают exception виджета либо
  application exception. Обычная action error остаётся в `useSubmit.error`.

Renderer не импортирует React-срез и не зависит от browser navigation.

## Проверки

Из корня монорепы `code/`:

- `yarn workspace @sellgar/app typecheck`, `yarn workspace @sellgar/app typecheck:core`;
- `yarn test library/sellgar.app.ui/fsm/widget library/sellgar.app.ui/fsm/application/lifecycle/application/application-widget.test.tsx`;
- `yarn test library/sellgar.app.ui` — регрессия остальных срезов и общего core.
