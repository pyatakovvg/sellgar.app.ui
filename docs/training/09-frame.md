# Занятие 9. Frame: Адресуемый Overlay Runtime

- Статус документа: current
- Формат: 90 минут
- Уже известно: routes, controllers, widget runtime
- Новые понятия: Frame/Source/Shell/View, `HashFrameSource`, `useFrame`, frame
  controller, parent history

## Результат Занятия

Детали заказа открываются поверх `/orders`, отражаются в hash URL, переживают
refresh как direct link и закрываются через shell. Затем добавляется переход из
details frame в связанный frame и возврат назад.

---

## Слайд 1. Module, Widget Или Frame?

### На Экране

```text
самостоятельный экран       -> Module
встроенный независимый блок -> Widget
overlay поверх route        -> Frame
```

### Заметки Ведущего

Frame выбирается не потому, что UI выглядит как drawer. Нужны presentation
runtime, command API open/close и source адресуемого active state.

---

## Слайд 2. Четыре Роли Frame

### На Экране

```text
Frame  -> runtime definition
Source -> активация, props, close handler
Shell  -> drawer/modal/fullscreen presentation
View   -> runtime content
```

### Заметки Ведущего

Не смешивайте shell и view. Shell знает, как закрыть overlay и отобразить
chrome; view знает данные и действия предметного сценария.

---

## Слайд 3. Typed Params И Declaration

### На Экране

```ts
class OrderDetailsFrameParams {
  @Expose()
  id!: string;
}
```

```tsx
@UseBindings(OrderDetailsBindings)
@Frame<OrderDetailsFrameParams>({
  source: HashFrameSource.create(
    'order-details',
    OrderDetailsFrameParams,
  ),
  shell: OrderDetailsFrameShell,
  fallback: <p>Загружаем детали…</p>,
  exception: <p>Детали недоступны</p>,
  view: OrderDetailsFrameView,
})
export class OrderDetailsFrame
  extends FrameDefinition<OrderDetailsFrameParams> {}
```

### Заметки Ведущего

Hash key принадлежит source/declaration. Вызывающий code передаёт typed props и
не собирает hash вручную.

---

## Слайд 4. Frame Должен Быть Доступен Route-Ветке

### На Экране

```ts
new Route({
  path: '/orders',
  frames: [OrderDetailsFrame],
  load: () => import('@module/orders'),
});
```

### Заметки Ведущего

Frames наследуются child routes. Глобальный `FrameLayer` уже установлен
`Application.createView()`; feature layout не рендерит отдельный host.

---

## Слайд 5. Открытие Из React

### На Экране

```tsx
const details = useFrame(OrderDetailsFrame);

<button onClick={() => details.open({ id: order.id })}>
  Детали
</button>
```

```text
/orders#order-details(id='100')
```

### Заметки Ведущего

Hash является состоянием source. Из controller/service тот же сценарий
использует `FrameServiceInterface`, а не React hook.

---

## Слайд 6. Shell Закрывает Всю Frame-Сессию

### На Экране

```tsx
@Injectable()
class OrderDetailsFrameShell extends FrameShellInterface {
  render(context: FrameShellContextInterface) {
    return (
      <aside aria-hidden={!context.open}>
        <button onClick={() => context.close()}>Закрыть</button>
        {context.content}
      </aside>
    );
  }
}
```

### Заметки Ведущего

Overlay click, Escape и кнопка закрытия вызывают `context.close()`. Кнопка
«Назад» внутри вложенного frame flow вызывает `back()`, а не полное close.

---

## Слайд 7. Frame Controller Локален Instance

### На Экране

```ts
async loader(args: FrameControllerLoaderArgs<OrderDetailsFrameParams>) {
  return this.orders.getById(args.props.id, {
    signal: args.signal,
  });
}
```

```tsx
const data = useLoaderData(OrderDetailsControllerInterface);
const submit = useSubmit(OrderDetailsControllerInterface);
```

### Заметки Ведущего

Изменение raw hash props меняет runtime key и remount-ит frame runtime. Loader
получает frame props, route params, request и lifecycle signal.

---

## Слайд 8. Parent History

### На Экране

```text
OrderDetailsFrame
-> open PaymentDetailsFrame
-> back()
-> OrderDetailsFrame

close()
-> закрыть всю frame session
```

### Заметки Ведущего

URL хранит только текущий frame. Parent stack хранится во внутреннем
`sessionStorage` с областью по `router.baseUrl`. При несовпадении сохранённого
current и hash история считается stale и очищается.

---

## Слайд 9. Direct Link И Startup

### На Экране

```text
refresh /orders#order-details(id='100')
-> route matches
-> available frames resolve
-> frame runtime loads
-> FrameLayer renders shell + view
```

### Заметки Ведущего

Frame — адресуемое состояние. При hash-only open после render route loaders не
перезапускаются автоматически.

---

## Слайд 10. Практика

1. Создать params DTO, frame declaration, shell и view.
2. Зарегистрировать frame на `/orders`.
3. Открыть details через `useFrame`.
4. Обновить страницу с active hash.
5. Добавить controller loader.
6. Открыть второй frame из первого и сравнить `back` с `close`.

### Мост К Следующей Теме

Widget показывает fallback после render, а frame должен подписаться на внешнее
событие и обязательно очистить subscription. Это задачи lifecycle provider.

## Источники Ведущего

- [Frames](../06-frames.md)
- [Frame package structure](../15-frame-package-structure.md)

