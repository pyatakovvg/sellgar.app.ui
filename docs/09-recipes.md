# Рецепты

Этот раздел отвечает на практические вопросы: что сделать, если нужно добавить
конкретное поведение в интерфейс.

Каждый рецепт показывает минимальный набор действий. Если нужен полный
вертикальный пример, см. [Быстрый старт](./00-quick-start.md).

## Добавить Новый Экран

Используй route module.

Минимальные шаги:

1. Создай module package.
2. Создай controller token и implementation.
3. Создай bindings.
4. Создай module declaration.
5. Создай view.
6. Добавь route с `load`.

Controller token:

```ts
export abstract class OrdersControllerInterface implements ControllerInterface {
  abstract loader(args: ControllerLoaderArgs): Promise<OrdersLoaderData>;
}
```

Module:

```tsx
@UseBindings(OrdersBindings)
@Module({
  view: OrdersView,
})
export class OrdersModule {}
```

Route:

```ts
new Route({
  path: '/orders',
  load: () => import('@module/orders'),
});
```

View:

```tsx
const data = useLoaderData(OrdersControllerInterface);
```

## Добавить Loader Data

Loader принадлежит controller.

```ts
@Controller()
export class OrdersController extends OrdersControllerInterface {
  constructor(
    @Inject(OrdersServiceInterface)
    private readonly ordersService: OrdersServiceInterface,
  ) {
    super();
  }

  async loader(args: ControllerLoaderArgs): Promise<OrdersLoaderData> {
    return {
      items: await this.ordersService.getOrders({
        signal: args.request.signal,
      }),
    };
  }
}
```

View читает результат по controller token:

```tsx
const data = useLoaderData(OrdersControllerInterface);
```

Не используй `useDependency(...)` для чтения loader result.

## Добавить Action

Action тоже принадлежит controller. Если у feature уже есть loader controller,
не обязательно добавлять action в него. Часто лучше создать отдельный
controller под отдельную команду.

Token:

```ts
export abstract class CancelOrderControllerInterface implements ControllerInterface {
  abstract action(args: ControllerActionArgs<CancelOrderPayload>): Promise<void>;
}
```

Implementation:

```ts
@Controller()
export class CancelOrderController extends CancelOrderControllerInterface {
  constructor(
    @Inject(OrdersServiceInterface)
    private readonly ordersService: OrdersServiceInterface,
  ) {
    super();
  }

  async action(args: ControllerActionArgs<CancelOrderPayload>): Promise<void> {
    await this.ordersService.cancel(args.payload.id, {
      signal: args.request.signal,
    });
  }
}
```

Module metadata:

```tsx
@Module({
  view: OrdersView,
})
export class OrdersModule {}
```

View:

```tsx
const cancelOrder = useSubmit(CancelOrderControllerInterface);

await cancelOrder({ id: order.id });
```

Если после action нужно обновить данные, явно вызови revalidate.

## Обновить Данные После Mutation

Navigation и mutation не обновляют loader data автоматически.

Во view:

```tsx
const cancelOrder = useSubmit(CancelOrderControllerInterface);
const revalidate = useRevalidate();

await cancelOrder({ id });
await revalidate(OrdersControllerInterface);
```

В runtime-коде:

```ts
@Controller()
export class CancelOrderController extends CancelOrderControllerInterface {
  constructor(
    @Inject(OrdersServiceInterface)
    private readonly ordersService: OrdersServiceInterface,
    @Inject(RevalidateServiceInterface)
    private readonly revalidateService: RevalidateServiceInterface,
  ) {
    super();
  }

  async action(args: ControllerActionArgs<CancelOrderPayload>): Promise<void> {
    await this.ordersService.cancel(args.payload.id, {
      signal: args.request.signal,
    });

    await this.revalidateService.revalidate(OrdersControllerInterface);
  }
}
```

Выбирай один owner для revalidate. Не запускай один и тот же refresh и из view,
и из controller без причины.

## Добавить Query Params

Во view:

```tsx
const location = useLocation();
const navigate = useNavigate();

const filter = location.searchToObject(OrdersFilterParams, {
  enableTypeConversion: true,
});

await navigate.searchParams(
  {
    page: 2,
  },
  {
    merge: true,
  },
);
```

В runtime-коде:

```ts
const filter = this.locationService.searchToObject(OrdersFilterParams, {
  enableTypeConversion: true,
});

await this.navigateService.searchParams(
  {
    page: 2,
  },
  {
    merge: true,
  },
);
```

## Добавить Widget В Экран

Создай widget declaration:

```tsx
@Widget<OrdersSummaryWidgetProps>({
  fallback: <p>Виджет загружается...</p>,
  view: OrdersSummaryWidgetView,
})
export class OrdersSummaryWidget extends WidgetDefinition<OrdersSummaryWidgetProps> {}
```

Используй во view:

```tsx
<WidgetHost
  token={OrdersSummaryWidget}
  props={{
    title: 'Заказы',
  }}
/>
```

Если widget должен загрузиться до первого render экрана, добавь preload
provider.

## Preload Widget

Создай provider:

```ts
@Provider()
export class OrdersSummaryWidgetPreloadProvider extends RuntimeProviderInterface {
  constructor(
    @Inject(WidgetRuntimeFactoryInterface)
    private readonly widgetRuntimeFactory: WidgetRuntimeFactoryInterface,
  ) {
    super();
  }

  beforeRender(context: RuntimeProviderContextInterface): Promise<RuntimeProviderResult> {
    return this.widgetRuntimeFactory.preload(context, OrdersSummaryWidget, {
      props: {
        title: 'Заказы',
      },
    });
  }
}
```

Подключи provider в module или frame:

```tsx
@Module({
  providers: [OrdersSummaryWidgetPreloadProvider],
  view: OrdersView,
})
export class OrdersModule {}
```

Правило: `props` описывают только widget props. `ownerScope` и `signal`
передаются через provider context.

## Добавить Frame

Создай params DTO:

```ts
export class OrderDetailsFrameParams {
  @Expose()
  readonly id!: string;
}
```

Создай frame declaration:

```tsx
@UseBindings(OrderDetailsBindings)
@Frame<OrderDetailsFrameParams>({
  source: HashFrameSource.create('order-details', OrderDetailsFrameParams),
  shell: OrderDetailsFrameShell,
  fallback: <p>Фрейм загружается...</p>,
  view: FrameView,
})
export class OrderDetailsFrame extends FrameDefinition<OrderDetailsFrameParams> {}
```

Если frame должен загрузить собственные данные, добавь
`FrameControllerInterface` и читай результат во view:

```tsx
const data = useLoaderData(OrderDetailsControllerInterface);
const submit = useSubmit(OrderDetailsControllerInterface);
const revalidate = useRevalidate();
```

Если frame только показывает props из hash/source и не имеет собственной
business logic, `controllers` можно не объявлять.

Добавь frame в route:

```ts
new Route({
  path: '/',
  frames: [OrderDetailsFrame],
  routes: [
    new Route({
      path: '/orders',
      load: () => import('@module/orders'),
    }),
  ],
});
```

Открой из view:

```tsx
const orderDetailsFrame = useFrame(OrderDetailsFrame);

await orderDetailsFrame.open({ id });
```

Открой из controller:

```ts
await this.frameService.open(OrderDetailsFrame, { id });
```

Потребитель не знает hash key. Hash key принадлежит `HashFrameSource`.

## Выбрать Provider Phase

Используй `beforeLoad`, если controller loader должен увидеть результат
provider-а.

Используй `setup`, если provider владеет subscription или другим ресурсом на
протяжении всего lifetime runtime. `setup` выполняется один раз и возвращает
cleanup; revalidate не запускает его повторно.

Используй `beforeRender`, если нужно подготовить runtime contribution до первого
готового render. Типичный пример - widget preload.

Используй `afterRender`, если работа не должна блокировать первый render:
telemetry или effect, которому принципиально нужен уже выполненный render.

Не клади business mutation в provider phase. Provider должен подключать runtime
участника или lifecycle side effect.

## Выбрать Между Module, Widget И Frame

Используй module, если это основной экран route.

Используй widget, если UI-блок переиспользуется или должен иметь собственный
loader/action/revalidate runtime внутри разных экранов.

Используй frame, если UI должен открываться поверх текущего экрана и
активироваться через source, чаще всего hash.

Frame может иметь собственные controller loader/action/revalidate, но эти
данные живут внутри active frame runtime. Они не заменяют route/module loader.

Не используй frame как замену route для основного экрана.

Не используй widget как способ спрятать обычную часть module view, если ей не
нужен отдельный runtime.
