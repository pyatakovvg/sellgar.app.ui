# Занятие 9. Frame: Routed Overlay Runtime

- Статус документа: current
- Формат: 90 минут
- Уже известно: routes, controllers, widget runtime
- Новые понятия: `Frame`, `FrameRouter`, `FrameRoute`, global shell, absolute
  frame navigation

## Результат Занятия

Детали заказа открываются поверх `/orders`, отражаются в hash URL, переживают
refresh как direct link и закрываются через общий shell. Просмотр и
редактирование связаны URL-маршрутами без импорта frame tokens друг в друга.

---

## Слайд 1. Module, Widget Или Frame?

```text
самостоятельный экран       -> Module
встроенный независимый блок -> Widget
overlay поверх route        -> Frame
```

Frame выбирается не потому, что UI похож на drawer. Ему нужны собственный
runtime lifecycle и адресуемое состояние поверх текущего route screen.

---

## Слайд 2. Владельцы

```text
Frame       -> view, providers, layouts, fallback/exception
FrameRoute  -> path, lazy load, policies и route boundaries
FrameRouter -> baseSource, flow composition и optional shell
app.frames  -> обязательный global shell и global boundaries
```

Frame не знает URL, shell и соседние frames.

---

## Слайд 3. Typed Params И Declaration

```tsx
interface OrderDetailsFrameParams {
  readonly orderId: string;
}

@UseBindings(OrderDetailsBindings)
@Frame({
  fallback: <p>Загружаем детали…</p>,
  exception: <p>Детали недоступны</p>,
  view: OrderDetailsFrameView,
})
export class OrderDetailsFrame {}
```

Параметры не принадлежат class token: их задаёт активный `FrameRoute`. Source и
shell в metadata отсутствуют.

---

## Слайд 4. Routing Flow

```ts
const OrdersFrameRouter = new FrameRouter({
  baseSource: 'orders/:orderId',
  routes: [
    new FrameRoute({ load: () => import('@frame/order-details') }),
    new FrameRoute({ path: 'edit', load: () => import('@frame/order-edit') }),
  ],
});

new Route({
  path: '/orders',
  frames: [OrdersFrameRouter],
  load: () => import('@module/orders'),
});
```

`Route.frames` принимает только `FrameRouter`. Router доступен только в активной
ветке обычного route tree.

---

## Слайд 5. Открытие Из React И Controller

```tsx
const navigate = useNavigate();

<button onClick={() => navigate.frame.open(`/orders/${order.id}`)}>Детали</button>;
```

```ts
await this.navigate.frame.open(`/orders/${orderId}/edit`);
```

`navigate.frame.open()` принимает абсолютный frame source. Frame token не
импортируется потребителем; используется общий navigation port.

---

## Слайд 6. Global Shell

```tsx
@FrameShell()
class ManagementPanelFrameShell implements FrameShellInterface {
  render({ close, content, open }: FrameShellContextInterface) {
    return (
      <aside aria-hidden={!open}>
        <button onClick={() => close()}>Закрыть</button>
        {content}
      </aside>
    );
  }
}
```

```tsx
app.frames({ shell: ManagementPanelFrameShell });
```

Неуказанные frame boundaries наследуются из `app.components`.

---

## Слайд 7. Frame Controller

```ts
async loader(args: ControllerArgs<WithParams<OrderDetailsFrameParams>>) {
  return this.orders.getById(args.params.orderId, {
    signal: args.signal,
  });
}
```

```tsx
const data = useLoaderData(OrderDetailsControllerInterface);
const submit = useSubmit(OrderDetailsControllerInterface);
```

Controller получает path params как `args.params`. View при необходимости
читает тот же runtime-контракт через `useParams<OrderDetailsFrameParams>()`.
Hash и React Router objects в feature-код не передаются.

---

## Слайд 8. Browser History

```text
page
-> /orders/100
-> /orders/100/edit
-> close
```

Каждый `to()` и `close()` по умолчанию создаёт обычную browser history entry.
Browser back проходит по этим URL. У frame API нет собственного `back()`,
parent stack и попыток вычислить родителя по declarations.

При прямом открытии `/orders/100/edit` browser back возвращает туда, откуда
пользователь действительно пришёл. Если feature нужна кнопка на конкретный URL,
она выполняет явную navigation.

---

## Слайд 9. Direct Link И Startup

```text
refresh /orders#orders/100/edit
-> обычный Router выбирает active Route branch
-> доступный FrameRouter сопоставляет hash
-> FrameRoute lazy-load-ит Frame
-> shell отображает Frame runtime
```

Hash-only navigation не должна повторно запускать обычные route loaders.

---

## Слайд 10. Практика

1. Создать frame declaration, view и controller.
2. Настроить global shell через `app.frames(...)`.
3. Подключить `FrameRouter` к `/orders`.
4. Открыть details через `useNavigate().frame.open('/absolute/source')`.
5. Добавить edit `FrameRoute`.
6. Проверить refresh, close и browser back.

## Источники Ведущего

- [Frames](../06-frames.md)
- [Frame package structure](../15-frame-package-structure.md)
