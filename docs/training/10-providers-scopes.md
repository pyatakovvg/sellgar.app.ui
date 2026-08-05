# Занятие 10. Providers, Phases И Runtime Scopes

- Статус документа: current
- Формат: 75–90 минут
- Уже известно: module, widget и frame runtimes
- Новые понятия: `@Provider`, provider pipeline, cleanup, provider-local
  bindings, preload, singleton provider

## Результат Занятия

Summary widget подготавливается до render module, а subscription живёт ровно
столько, сколько владеющий runtime. Слушатель выбирает provider phase по
зависимости сценария, а не по удобству.

---

## Слайд 1. Provider — Участник Lifecycle

### На Экране

```text
Provider подходит:
- preload
- subscription
- telemetry
- подготовка до loader/render

Provider не подходит:
- business command по клику пользователя
```

### Заметки Ведущего

Business operation остаётся controller action или service. Provider появляется,
когда процесс должен автоматически следовать lifecycle owner runtime.

---

## Слайд 2. Минимальный Setup + Cleanup

### На Экране

```ts
@Provider()
export class OrdersEventsProvider
  extends RuntimeProviderInterface {
  setup(): RuntimeProviderResult {
    const subscription = subscribeToOrders();
    return () => subscription.dispose();
  }
}
```

### Заметки Ведущего

Ресурс lifetime boundary создаётся в `setup`. Cleanup возвращается сразу и
вызывается runtime при dispose. Не прячьте долгоживущую subscription в
`afterRender` без cleanup.

---

## Слайд 3. Pipeline Phases

### На Экране

```text
beforeLoad
-> controller loaders
-> setup (один раз на runtime lifetime)
-> beforeRender
-> render
-> afterRender
-> dispose cleanup
```

### Заметки Ведущего

- `beforeLoad`: loader зависит от подготовки.
- `setup`: ресурс живёт весь boundary.
- `beforeRender`: preload/подготовка view.
- `afterRender`: analytics после состоявшегося render.
- `onDemand`: только явный runtime request.

Повторный loader/revalidate не повторяет `setup`.

---

## Слайд 4. Context Вместо Чужого Scope

### На Экране

```ts
interface RuntimeProviderContextInterface {
  params: Record<string, string | undefined>;
  phase: string;
  request: Request;
  scope: RuntimeScope;
  signal: AbortSignal;
}
```

### Заметки Ведущего

ProviderScope — соседняя ветка для module/frame/widget scopes. Provider не
получает их local bindings constructor injection. Runtime-specific `params`,
`scope`, `request` и `signal` приходят через context.

---

## Слайд 5. Provider Сам Подключает Dependencies

### На Экране

```ts
@UseBindings(OrdersEventsBindings)
@Provider()
export class OrdersEventsProvider
  extends RuntimeProviderInterface {
  constructor(
    @Inject(OrdersEventsSourceInterface)
    private readonly source: OrdersEventsSourceInterface,
  ) {
    super();
  }
}
```

### Заметки Ведущего

Owner module не дублирует provider bindings. Не bind-ите сам provider class:
его instance lifecycle принадлежит framework.

---

## Слайд 6. Widget Preload

### На Экране

```ts
@Provider()
class OrdersSummaryPreloadProvider
  extends RuntimeProviderInterface {
  constructor(
    @Inject(WidgetRuntimeFactoryInterface)
    private readonly widgets: WidgetRuntimeFactoryInterface,
  ) {
    super();
  }

  beforeRender(context: RuntimeProviderContextInterface) {
    return this.widgets.preload(context, OrdersSummaryWidget, {
      props: { title: 'Заказы' },
    });
  }
}
```

### Заметки Ведущего

Prepared runtime найдётся только при совпадении owner scope, widget token и
runtimeKey. `context.scope/signal` не дублируются в props.

---

## Слайд 7. Повторная Route Activation

### На Экране

```text
enter /orders -> new pipeline -> setup
revalidate    -> same pipeline -> setup не повторяется
leave         -> cleanup
enter again   -> new pipeline -> setup снова
```

### Заметки Ведущего

Это один из ключевых production cases. Route declaration может быть той же, но
после dispose создаётся новый runtime lifecycle boundary.

---

## Слайд 8. Singleton Provider — Другой Контракт

### На Экране

```ts
@SingletonProvider()
class OrdersUpdatesProvider
  implements SingletonProviderInterface {
  setup(): RuntimeProviderResult {
    return this.source.subscribe(handleUpdate);
  }
}
```

```text
first lease -> setup
more leases -> reuse
last release -> cleanup
```

### Заметки Ведущего

Singleton provider не получает runtime context и имеет только `setup`.
Используйте его для context-free shared integration, а не как настройку
обычного provider.

---

## Слайд 9. Практика

1. Preload-ить summary widget из Orders module.
2. Добавить setup subscription с видимым cleanup log.
3. Перейти с route и вернуться.
4. Выполнить revalidate и убедиться, что setup не повторился.
5. Сравнить normal и singleton provider на двух активных owners.

### Мост К Следующей Теме

Provider умеет владеть subscription, но нужен framework-level канал между
независимыми action и listeners. Следующая тема — application event bus и
разделение store/session/events.

## Источники Ведущего

- [Provider contract и phases](../04-modules-controllers-providers.md)
- [Runtime scopes](../07-di-runtime-state-events.md)
- [Ментальная модель ownership](../01-mental-model.md)

