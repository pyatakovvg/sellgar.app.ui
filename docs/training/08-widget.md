# Занятие 8. Widget: Переиспользуемый UI Runtime

- Статус документа: current
- Формат: 75–90 минут
- Уже известно: module/controller DI flow
- Новые понятия: `@Widget`, `WidgetDefinition`, `WidgetHost`, widget props,
  widget controller, `runtimeKey`

## Результат Занятия

`OrdersSummaryWidget` используется в module и layout, получает данные через
собственный controller и показывает локальные fallback, action state и error.

---

## Слайд 1. Когда Component Становится Widget

### На Экране

```text
Обычный component подходит, пока ему достаточно props.

Widget нужен, если блоку требуются собственные:
- loader/action
- DI scope
- fallback/error
- revalidate
- independent lifecycle
```

### Заметки Ведущего

Не учите «переиспользуется — значит widget». Переиспользуемый presentational
component остаётся component. Runtime-потребность является главным критерием.

---

## Слайд 2. Typed Declaration

### На Экране

```tsx
interface OrdersSummaryWidgetProps {
  title: string;
}

@UseBindings(OrdersSummaryWidgetBindings)
@Widget<OrdersSummaryWidgetProps>({
  fallback: <p>Загружаем summary…</p>,
  exception: <p>Summary недоступен</p>,
  view: OrdersSummaryWidgetView,
})
export class OrdersSummaryWidget
  extends WidgetDefinition<OrdersSummaryWidgetProps> {}
```

### Заметки Ведущего

`WidgetDefinition<TProps>` делает token типизированным: host знает обязательные
props. Declaration не создаёт instance.

---

## Слайд 3. Rendering Через WidgetHost

### На Экране

```tsx
<WidgetHost
  token={OrdersSummaryWidget}
  props={{ title: 'Заказы' }}
/>
```

### Заметки Ведущего

`WidgetHost` соединяет React composition с widget runtime. Он создаёт либо
использует подготовленный runtime, но cleanup выполняет сам runtime.

---

## Слайд 4. Widget Controller Получает Props И Signal

### На Экране

```ts
abstract class OrdersSummaryControllerInterface
  extends WidgetControllerInterface<OrdersSummaryWidgetProps> {
  abstract loader(
    args: WidgetControllerLoaderArgs<OrdersSummaryWidgetProps>,
  ): Promise<{ count: number }>;
}
```

```ts
async loader(args) {
  return {
    count: await this.orders.count({ signal: args.signal }),
  };
}
```

### Заметки Ведущего

Сравните с module controller: widget loader получает widget `props` и widget
lifecycle `signal`. Его bindings принадлежат WidgetScope.

---

## Слайд 5. Hooks Работают В Ближайшем Widget Runtime

### На Экране

```tsx
const props = useWidgetProps<OrdersSummaryWidgetProps>();
const data = useLoaderData(OrdersSummaryControllerInterface);
const refresh = useSubmit(OrdersSummaryControllerInterface);

return (
  <section>
    <h2>{props.title}</h2>
    <strong>{data.count}</strong>
    <button disabled={refresh.inProcess} onClick={() => refresh({ reason: 'manual' })}>
      Обновить
    </button>
  </section>
);
```

### Заметки Ведущего

Те же controller hooks переиспользуются в разных runtimes, а nearest context
выбирает module/widget/frame data boundary.

---

## Слайд 6. Идентичность Widget Runtime

### На Экране

```text
owner scope + widget token + runtimeKey
```

```tsx
<WidgetHost token={OrdersSummaryWidget} runtimeKey="header" props={...} />
<WidgetHost token={OrdersSummaryWidget} runtimeKey="sidebar" props={...} />
```

### Заметки Ведущего

Без `runtimeKey` один owner использует default instance этого token. Key нужен
только для действительно независимых instances; не превращайте его в
обязательный style attribute.

---

## Слайд 7. Lifecycle И Process State — Разные Оси

### На Экране

```text
Lifecycle: idle -> loading -> ready -> disposing -> disposed
                         \-> failed

Process: submit/revalidate inProcess + error
```

### Заметки Ведущего

Ошибка initial loader может показать widget exception. Ошибка submit остаётся
локальным recoverable state и не обязана переводить весь widget в failed.

---

## Слайд 8. Preload Пока Только Как Требование

### На Экране

```text
Без preload:
render WidgetHost -> loading fallback -> ready

С preload:
owner готовит runtime -> WidgetHost получает prepared runtime
```

### Заметки Ведущего

Не показывайте provider implementation до занятия 10. Сейчас аудитория должна
понять, какую проблему решает preload и почему identity owner/token/runtimeKey
должна совпасть.

---

## Слайд 9. Практика

1. Создать typed widget declaration.
2. Добавить widget-local bindings и controller loader.
3. Отрендерить widget в Orders module.
4. Добавить второй instance с отдельным `runtimeKey`.
5. Искусственно сломать loader и увидеть локальную exception boundary.
6. Объяснить, почему `OrdersHeading` не следует превращать в widget.

### Мост К Следующей Теме

Следующий сценарий — детали заказа поверх списка, адресуемые через URL. Widget
не решает open/close и overlay session: нужен frame.

## Источники Ведущего

- [Widgets](../05-widgets.md)
- [Widget package structure](../12-widget-package-structure.md)

