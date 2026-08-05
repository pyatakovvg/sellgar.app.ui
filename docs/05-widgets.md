# Виджеты

Widget - переиспользуемый UI-блок с собственным runtime. Он не является просто
React component: у него есть DI scope, controllers, loader/action lifecycle,
fallback/error rendering и отдельный revalidate mechanism.

## За Что Отвечает Widget

Widget владеет:

- metadata из `@Widget(...)`;
- `WidgetScope`;
- widget controllers;
- widget providers через общий `RuntimeProviderInterface<TProps>`;
- initial loader;
- widget action;
- runtime-local revalidate;
- process state для submit/revalidate;
- rendering через `WidgetHost`.

## Когда Использовать Widget

Используй widget, если UI-блок:

- переиспользуется в разных modules или frames;
- должен иметь собственный loader/action lifecycle;
- должен preload-иться отдельно от module loader;
- должен revalidate-иться независимо от route/module data;
- должен иметь собственный fallback/error внутри части экрана.

Не используй widget только ради разбиения JSX на компоненты. Если блоку не
нужен runtime, controller или preload, достаточно обычного React component.

## Declaration Виджета

```tsx
export interface OrdersSummaryWidgetProps {
  readonly title: string;
}

@UseBindings(OrdersSummaryWidgetBindings)
@Widget<OrdersSummaryWidgetProps>({
  fallback: <p>Виджет загружается...</p>,
  exception: <p>Виджет не загрузился</p>,
  view: OrdersSummaryWidgetView,
})
export class OrdersSummaryWidget extends WidgetDefinition<OrdersSummaryWidgetProps> {}
```

`WidgetDefinition<TProps>` нужен для типизации token. Благодаря этому
`WidgetHost` понимает, какие `props` обязательны для widget.

## Формы View

`view` принимает `RenderableView<TProps>`:

```tsx
view: OrdersSummaryWidgetView;
view: <OrdersSummaryWidgetView />;
view: (props) => <OrdersSummaryWidgetView {...props} />;
```

Предпочтительная форма - `view: OrdersSummaryWidgetView`.

Функциональную форму используй, если нужен adapter.

Форма React element подходит только для views без runtime props.

## Rendering Через WidgetHost

Widget во view рендерится через `WidgetHost`:

```tsx
export const OrdersView: React.FC = () => {
  return (
    <WidgetHost
      token={OrdersSummaryWidget}
      props={{
        title: 'Orders',
      }}
    />
  );
};
```

Если `TProps` не пустой, `props` обязателен.

Если `TProps` пустой, `props` можно не передавать:

```tsx
<WidgetHost token={NotificationsWidget} />
```

`WidgetHost` является terminal boundary для `widget.failed`. Ошибка loader,
blocking provider или React render переводит в `failed` только конкретный widget
runtime и показывается на месте этого widget. Module, frame и соседние widgets
остаются active. Render failure публикуется с `operation: 'render'`. Если
`@Widget.exception` задан, используется он; иначе framework
переиспользует `exception` из application configuration. Выбранное представление
рендерится внутри конкретного `WidgetHost`; специальная неблокирующая реакция,
например notification, задаётся локальным `@Widget.exception`.

Failure продолжает передаваться reporter-у с исходными `owner`, `participant` и
`operation`. Поздняя ошибка процесса, запущенного после успешного provider hook,
не относится к завершённой widget activation.

## Идентичность Runtime

По умолчанию widget runtime определяется так:

```text
owner scope + widget token + default runtime key
```

Если один owner scope должен держать несколько независимых runtime для одного
widget token, используй `runtimeKey`:

```tsx
<WidgetHost token={OrdersSummaryWidget} runtimeKey="header" props={{ title: 'Заголовок' }} />
<WidgetHost token={OrdersSummaryWidget} runtimeKey="sidebar" props={{ title: 'Боковая панель' }} />
```

`runtimeKey` не должен становиться default style. Он нужен только для
действительно независимых instances.

## Widget Controller

Widget controller похож на route/module controller, но работает внутри widget
runtime и получает widget props.

```ts
export interface OrdersSummaryData {
  readonly count: number;
}

export interface RefreshOrdersSummaryPayload {
  readonly reason: string;
}

export abstract class OrdersSummaryWidgetControllerInterface extends WidgetControllerInterface<OrdersSummaryWidgetProps> {
  abstract loader(args: WidgetControllerLoaderArgs<OrdersSummaryWidgetProps>): Promise<OrdersSummaryData>;

  abstract action(
    args: WidgetControllerActionArgs<OrdersSummaryWidgetProps, RefreshOrdersSummaryPayload>,
  ): Promise<OrdersSummaryData>;
}

@Controller()
export class OrdersSummaryWidgetController extends OrdersSummaryWidgetControllerInterface {
  constructor(
    @Inject(OrdersServiceInterface)
    private readonly ordersService: OrdersServiceInterface,
  ) {
    super();
  }

  async loader(args: WidgetControllerLoaderArgs<OrdersSummaryWidgetProps>): Promise<OrdersSummaryData> {
    return {
      count: await this.ordersService.count({
        signal: args.signal,
      }),
    };
  }

  async action(
    args: WidgetControllerActionArgs<OrdersSummaryWidgetProps, RefreshOrdersSummaryPayload>,
  ): Promise<OrdersSummaryData> {
    await this.ordersService.refresh({
      reason: args.payload.reason,
      signal: args.signal,
    });

    return this.loader(args);
  }
}
```

`WidgetControllerLoaderArgs<TProps>` содержит:

```ts
args.props;
args.signal;
```

`WidgetControllerActionArgs<TProps, TPayload>` содержит:

```ts
args.props;
args.payload;
args.signal;
```

## Hooks Во Widget View

```tsx
export const OrdersSummaryWidgetView: React.FC<OrdersSummaryWidgetProps> = () => {
  const props = useWidgetProps<OrdersSummaryWidgetProps>();
  const data = useLoaderData(OrdersSummaryWidgetControllerInterface);
  const submit = useSubmit(OrdersSummaryWidgetControllerInterface);
  const revalidate = useRevalidate();

  return (
    <section>
      <h2>{props.title}</h2>
      <span>{data.count}</span>
      <button disabled={submit.inProcess} type="button" onClick={() => submit({ reason: 'manual' })}>
        Обновить
      </button>
      <button type="button" onClick={() => revalidate()}>
        Перезагрузить
      </button>
    </section>
  );
};
```

Доступные hooks:

```ts
useWidgetProps<TProps>();
useController(OrdersSummaryWidgetControllerInterface);
useLoaderData(OrdersSummaryWidgetControllerInterface);
useSubmit(OrdersSummaryWidgetControllerInterface);
useRevalidate();
```

`useSubmit(...)` возвращает function со state:

```ts
submit.inProcess;
submit.data;
submit.error;
```

Submit state общий для активного widget runtime и controller token. Несколько
вызовов `useSubmit(...)` для одного controller в одном widget instance
читают один `inProcess`, `data` и `error`.

Один controller token в одном widget runtime может держать только один pending
submit. Повторный вызов из любого hook instance во время active submit вернет
rejected promise.

## Revalidate Из Controller

Widget controller может запускать revalidate своего widget runtime через DI.

```ts
@Controller()
export class OrdersSummaryWidgetController extends OrdersSummaryWidgetControllerInterface {
  constructor(
    @Inject(RevalidateServiceInterface)
    private readonly revalidateService: RevalidateServiceInterface,
  ) {
    super();
  }

  async action(args: WidgetControllerActionArgs<OrdersSummaryWidgetProps, RefreshOrdersSummaryPayload>): Promise<void> {
    await this.revalidateService.revalidate({
      signal: args.signal,
    });
  }
}
```

Это обновляет active widget runtime. Token сервиса общий, а конкретная
реализация выбирается ближайшим runtime scope.

## Widget Preload

Widget можно подготовить до первого render через runtime provider.
Provider всегда помечается `@Provider()` и использует общий provider contract.
Если provider запускается в widget runtime, `context.props` содержит typed
widget props. Если provider запускается в route/layout/module runtime,
`context.props` равен пустому object.

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
        title: 'Orders',
      },
    });
  }
}
```

Provider можно подключить к module, frame или layout, который владеет этим
widget:

```tsx
@Module({
  providers: [OrdersSummaryWidgetPreloadProvider],
  view: OrdersView,
})
export class OrdersModule {}
```

`WidgetHost` использует prepared runtime, если он найден по тому же
`ownerScope`, widget token и `runtimeKey`.

## Lifecycle-Фазы

Widget runtime snapshot phase:

```text
idle
loading
ready
failed
disposing
disposed
```

Rendering:

```text
phase != ready
  fallback

phase == failed
  error

phase == ready
  view
```

Process state для submit/revalidate не является lifecycle phase. Эти состояния
доступны через hooks.
