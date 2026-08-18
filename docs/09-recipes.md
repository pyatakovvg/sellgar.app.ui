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
export abstract class OrdersControllerInterface {
  abstract loader(args: ControllerArgs): Promise<OrdersLoaderData>;
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
export class OrdersController implements OrdersControllerInterface {
  constructor(
    @Inject(OrdersServiceInterface)
    private readonly ordersService: OrdersServiceInterface,
  ) {}

  async loader(args: ControllerArgs): Promise<OrdersLoaderData> {
    return {
      items: await this.ordersService.getOrders({
        signal: args.signal,
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
export abstract class CancelOrderControllerInterface {
  abstract action(args: ControllerArgs<WithPayload<CancelOrderPayload>>): Promise<void>;
}
```

Implementation:

```ts
@Controller()
export class CancelOrderController implements CancelOrderControllerInterface {
  constructor(
    @Inject(OrdersServiceInterface)
    private readonly ordersService: OrdersServiceInterface,
  ) {}

  async action(args: ControllerArgs<WithPayload<CancelOrderPayload>>): Promise<void> {
    await this.ordersService.cancel(args.payload.id, {
      signal: args.signal,
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
export class CancelOrderController implements CancelOrderControllerInterface {
  constructor(
    @Inject(OrdersServiceInterface)
    private readonly ordersService: OrdersServiceInterface,
    @Inject(RevalidateServiceInterface)
    private readonly revalidateService: RevalidateServiceInterface,
  ) {}

  async action(args: ControllerArgs<WithPayload<CancelOrderPayload>>): Promise<void> {
    await this.ordersService.cancel(args.payload.id, {
      signal: args.signal,
    });

    await this.revalidateService.revalidate(OrdersControllerInterface);
  }
}
```

Выбирай один owner для revalidate. Не запускай один и тот же refresh и из view,
и из controller без причины.

## Добавить Query Params

Query DTO владеет преобразованием URL-значений. Для массивного фильтра учти,
что один query-параметр парсится как скаляр, а повторяющиеся параметры — как
массив:

```ts
import { Expose, Transform, type TransformFnParams } from 'class-transformer';
import { IsArray, IsString } from 'class-validator';

const normalizeArrayValue = ({ value }: TransformFnParams): unknown => {
  return value === undefined || Array.isArray(value) ? value : [value];
};

class OrdersFilterParams {
  @Expose()
  @Transform(normalizeArrayValue)
  @IsArray()
  @IsString({ each: true })
  readonly status?: string[];
}
```

Не ограничивайся `{ each: true }`: без `@Transform(...)` значение
`?status=active` останется строкой, а без `@IsArray()` DTO не проверяет тип
контейнера. Полное объяснение и пример числового массива — в
[Router И Навигация](./03-router-and-navigation.md#массивы-в-query-dto).

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
export class OrdersSummaryWidgetPreloadProvider implements RuntimeProviderInterface {
  constructor(
    @Inject(WidgetPreloaderInterface)
    private readonly widgetPreloader: WidgetPreloaderInterface,
  ) {}

  beforeRender(context: RuntimeProviderContextInterface): Promise<RuntimeProviderResult> {
    return this.widgetPreloader.preload(context, OrdersSummaryWidget, {
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

Создай внутренний params type:

```ts
interface OrderDetailsFrameParams {
  readonly id: string;
}
```

Создай frame declaration:

```tsx
@UseBindings(OrderDetailsBindings)
@Frame({
  fallback: <p>Фрейм загружается...</p>,
  view: FrameView,
})
export class OrderDetailsFrame {}
```

Если frame должен загрузить собственные данные, добавь
прикладной controller token и читай результат во view:

```tsx
const data = useLoaderData(OrderDetailsControllerInterface);
const submit = useSubmit(OrderDetailsControllerInterface);
const revalidate = useRevalidate();
```

Если frame только показывает route params и не имеет собственной
business logic, `controllers` можно не объявлять.

Добавь frame в route:

```ts
new Route({
  path: '/',
  frames: [
    new FrameRouter({
      baseSource: 'orders/:id',
      routes: [new FrameRoute({ load: () => import('@frame/order-details') })],
    }),
  ],
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
const navigate = useNavigate();

await navigate.frame.open(`/orders/${id}`);
```

Открой из controller:

```ts
await this.navigate.frame.open(`/orders/${id}`);
```

Переход всегда задаётся абсолютным frame source. Frame token и hash parsing
потребителю не нужны.

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
