# Модули, Controllers И Providers

Module - route-level runtime для feature screen. Route решает, какой module
загрузить, а module описывает feature runtime: entity-local bindings, providers,
exception UI и view.

## Declaration Модуля

```tsx
@UseBindings(OrdersBindings)
@Module({
  providers: [OrdersSummaryWidgetPreloadProvider],
  exception: <OrdersExceptionView />,
  view: OrdersView,
})
export class OrdersModule {}
```

Module class является definition token. Feature code не создает его instances.

Route загружает module file через `load()`:

```ts
new Route({
  path: '/orders',
  load: () => import('@module/orders'),
});
```

Module export resolver находит exported module declaration в загруженном файле.

## Когда Использовать Module

Используй module, когда нужно описать основной экран route.

Module подходит для:

- route-level data loading;
- route-level actions;
- composition view для экрана;
- подключения providers до или после render экрана;
- module-level exception UI.

Не используй module для переиспользуемого UI-блока с собственным runtime. Для
этого нужен widget.

Не используй module для overlay-сценария поверх текущего экрана. Для этого
нужен frame.

## Metadata Модуля

`@Module(...)` поддерживает:

```ts
interface ModuleMetadata {
  readonly exception?: React.ReactNode;
  readonly providers?: readonly DependencyToken<RuntimeProviderInterface>[];
  readonly view: RenderableView;
}
```

`providers` - lifecycle participants для module runtime.

`exception` - UI для module runtime errors.

`view` - React view module-а.

## View Модуля

`view` принимает `RenderableView`:

```tsx
view: OrdersView;
view: <OrdersView />;
view: () => <OrdersView />;
```

Предпочтительная форма - `view: OrdersView`. Функциональная форма нужна, если view
нужно адаптировать.

## Контракт Controller

Controller - boundary для route/module data flow.

```ts
export interface ControllerLoaderArgs {
  readonly params: Record<string, string | undefined>;
  readonly request: Request;
}

export interface ControllerActionArgs<TPayload = unknown> {
  readonly params: Record<string, string | undefined>;
  readonly payload: TPayload;
  readonly request: Request;
}

export interface ControllerInterface {
  loader?(args: ControllerLoaderArgs): unknown | Promise<unknown>;
  action?(args: ControllerActionArgs): unknown | Promise<unknown>;
  dispose?(): void | Promise<void>;
}
```

`loader` готовит данные для view.

`action` выполняет mutation/command, вызванный из view.

`dispose` освобождает subscriptions/resources controller-а. Не используй
`dispose` для business mutations.

## Когда Использовать Controller

Используй controller, если нужно:

- загрузить данные для view;
- выполнить action из view;
- связать React Router loader/action transport с application/domain service;
- получить route params или request signal.

Не используй controller как long-lived store. Если данные должны жить на уровне
приложения, используй `ApplicationStoreInterface` или отдельный application
store.

Если появляется много независимых actions, лучше создать несколько маленьких
controllers, чем один большой controller с внутренним switch.

## Пример Controller

```ts
export interface OrdersLoaderData {
  readonly items: readonly OrderEntity[];
}

export interface UpdateOrderFilterPayload {
  readonly query: string;
}

export abstract class OrdersControllerInterface implements ControllerInterface {
  abstract loader(args: ControllerLoaderArgs): Promise<OrdersLoaderData>;
}

export abstract class UpdateOrderFilterControllerInterface implements ControllerInterface {
  abstract action(args: ControllerActionArgs<UpdateOrderFilterPayload>): Promise<void>;
}

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

@Controller()
export class UpdateOrderFilterController extends UpdateOrderFilterControllerInterface {
  constructor(
    @Inject(NavigateServiceInterface)
    private readonly navigateService: NavigateServiceInterface,
  ) {
    super();
  }

  async action(args: ControllerActionArgs<UpdateOrderFilterPayload>): Promise<void> {
    await this.navigateService.searchParams(
      {
        query: args.payload.query,
      },
      {
        merge: true,
      },
    );
  }
}
```

Controller должен быть помечен `@Controller()` на concrete implementation и
привязан в module-local bindings:

```ts
export class OrdersBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(OrdersControllerInterface).to(OrdersController);
    registry.bind(UpdateOrderFilterControllerInterface).to(UpdateOrderFilterController);
  }
}
```

Токен binding-а становится controller token для loader/action runtime. Binding
controller-а вне локального scope module/frame/widget считается ошибкой
конфигурации.

## Чтение Loader Data

Во view используй `useLoaderData(controllerToken)`.

```tsx
export const OrdersView: React.FC = () => {
  const data = useLoaderData(OrdersControllerInterface);

  return (
    <ul>
      {data.items.map((order) => (
        <li key={order.id}>{order.number}</li>
      ))}
    </ul>
  );
};
```

`useLoaderData(...)` читает данные из ближайшего controller runtime entity:
module, frame или widget.

Не читай loader data через `useDependency(...)`. DI hook не является API для
controller loader result.

## Отправка Actions

Во view используй `useSubmit(controllerToken)`.

```tsx
export const OrdersFilterView: React.FC = () => {
  const submit = useSubmit(UpdateOrderFilterControllerInterface);

  return (
    <button disabled={submit.inProcess} type="button" onClick={() => submit({ query: 'paid' })}>
      Применить
    </button>
  );
};
```

Submit function содержит state:

```ts
submit.inProcess;
submit.data;
submit.error;
```

Submit state общий для активного runtime scope и controller token. Если во view
несколько компонентов вызывают `useSubmit(UpdateOrderFilterControllerInterface)`,
они читают один и тот же `inProcess`, `data` и `error`.

Один controller token в одном runtime scope может держать только один pending
submit. Повторный вызов из любого hook instance во время active submit вернет
rejected promise.

Публичные action args используют `payload`:

```ts
async action(args: ControllerActionArgs<UpdateOrderFilterPayload>): Promise<void> {
  args.payload.query;
}
```

## Контракт Provider

Provider - lifecycle participant route, layout, module, frame или widget runtime.
Каждый provider, который попадает в `providers: [...]`, должен быть помечен
`@Provider()`. Framework создает такой concrete class token в отдельном instance
scope для каждого runtime pipeline.

Provider является самодостаточной DI-сущностью. Его собственные зависимости
подключаются на provider class через `@UseBindings(...)`:

```ts
@UseBindings(OrdersEventsBindings)
@Provider()
export class OrdersEventsProvider extends RuntimeProviderInterface {
  constructor(
    @Inject(OrdersEventsSourceInterface)
    private readonly source: OrdersEventsSourceInterface,
  ) {
    super();
  }
}
```

Application, module, frame и widget не должны дублировать
`OrdersEventsBindings`. Если несколько активных providers используют один и тот
же binding module, `ProviderScope` регистрирует его один раз и освобождает после
последнего provider pipeline.

Не привязывай сам provider class в binding module. `@UseBindings(...)` provider-а
предназначен только для его dependencies; lifecycle экземпляра принадлежит
framework.

```ts
type RuntimeProviderCleanup = () => void | Promise<void>;
type RuntimeProviderResult = void | RuntimeProviderCleanup;

export abstract class RuntimeProviderInterface {
  setup?(context: RuntimeProviderContextInterface): RuntimeProviderResult | Promise<RuntimeProviderResult>;

  beforeLoad?(context: RuntimeProviderContextInterface): RuntimeProviderResult | Promise<RuntimeProviderResult>;

  beforeRender?(context: RuntimeProviderContextInterface): RuntimeProviderResult | Promise<RuntimeProviderResult>;

  afterRender?(context: RuntimeProviderContextInterface): RuntimeProviderResult | Promise<RuntimeProviderResult>;

  onDemand?(context: RuntimeProviderContextInterface): RuntimeProviderResult | Promise<RuntimeProviderResult>;
}
```

Runtime сохраняет cleanup, возвращённый каждым hook, и вызывает его при
освобождении provider pipeline до освобождения provider dependencies.

Context provider-а:

```ts
interface RuntimeProviderContextInterface {
  readonly params: Record<string, string | undefined>;
  readonly phase: 'afterRender' | 'beforeLoad' | 'beforeRender' | 'onDemand' | 'setup';
  readonly request: Request;
  readonly scope: RuntimeScope;
  readonly signal: AbortSignal;
}
```

Provider может вернуть cleanup-функцию через `RuntimeProviderResult` для
очистки ресурсов, созданных конкретным lifecycle hook. Ресурс на весь lifetime
runtime boundary создаётся в однократном `setup`:

```ts
@Provider()
export class OrdersEventsProvider implements RuntimeProviderInterface {
  constructor(
    @Inject(ApplicationEventBusInterface)
    private readonly eventBus: ApplicationEventBusInterface,
  ) {}

  setup(): RuntimeProviderResult {
    const eventScope = this.eventBus.createScope().subscribe(OrderUpdatedEvent, this.handleOrderUpdated.bind(this));

    return () => {
      eventScope.dispose();
    };
  }

  private handleOrderUpdated(event: OrderUpdatedEvent): void {
    console.info(event.id);
  }
}
```

Для event bus lifecycle используй `ApplicationEventScope`, а не массив
subscriptions внутри provider/controller. `subscribe(...)` можно оставить для
одиночной подписки, если owner напрямую возвращает ее disposable в runtime
cleanup.

Provider instances не являются общими между runtime pipelines. Одновременное
использование одного provider в module, frame и widget создает три экземпляра и
три lifecycle-вызова. При этом их provider dependencies могут быть singleton в
общем `ProviderScope`.

Module/frame/widget bindings не видны provider-у. Локальные `scope`, `props`,
`params`, `request` и `signal` доступны только через provider context. Это не
разрывает preload-цепочку: provider получает application-level runtime factory и
передает ей context конкретного frame или widget.

## Singleton Provider

Context-free integration, которая изменяет глобальный runtime state и не должна
обрабатывать событие отдельно для каждого module/frame/widget, объявляется
отдельным provider contract:

```ts
import { SingletonProvider, SingletonProviderInterface, type RuntimeProviderResult } from '@sellgar/app';

@SingletonProvider()
export class OrdersUpdatesProvider implements SingletonProviderInterface {
  setup(): RuntimeProviderResult {
    return this.source.subscribe((update) => {
      updateEntity(OrderEntity, update);
    });
  }
}
```

`SingletonProviderInterface` требует только `setup()` без
`RuntimeProviderContextInterface`. Результат остаётся общим
`RuntimeProviderResult`.

Один singleton provider instance создаётся внутри application scope. Каждый
runtime pipeline из `providers` metadata получает lease:

- первый активный lease запускает `setup`;
- дополнительные leases ожидают тот же setup и не повторяют его;
- освобождение последнего lease запускает cleanup;
- новая активация после cleanup снова запускает `setup` на том же instance.

`@SingletonProvider()` нельзя заменять настройкой обычного `@Provider()`: у
контрактов разный набор hooks и разная доступность runtime context. Обычные
provider phases принадлежат конкретному runtime, singleton provider предназначен
только для shared resource lifecycle.

## Когда Использовать Provider

Используй provider, если нужно подключить runtime contribution к lifecycle:

- preload widget до render;
- подписаться на event bus после render;
- подключить telemetry;
- подготовить данные, от которых зависят controller loaders.

Не используй provider для business operation, которую вызывает пользователь.
Такая операция должна быть action controller или service.

## Фазы Provider

Текущий module startup order:

```text
activate module scope
-> resolve providers
-> beforeLoad providers
-> controller loaders
-> setup providers (один раз для этого runtime)
-> beforeRender providers
-> render ready screen
-> dispose providers при очистке module runtime
```

`beforeLoad` используй, когда controller loaders зависят от работы provider.

`setup` используй для ресурса, lifetime которого совпадает с runtime boundary:
socket/event subscription, observer или другой side effect с обязательным
cleanup. Повторный loader/revalidate не запускает `setup` снова.

Объект `RouteRuntime` может переживать несколько активаций одного route
declaration. Уход с маршрута окончательно освобождает текущий provider pipeline.
Если пользователь позже возвращается на маршрут, runtime создаёт новый pipeline
и новые runtime-local provider instances; их `setup` выполняется снова. Это
новый lifecycle boundary, а не revalidate ранее активного runtime.

`beforeRender` используй для подготовки перед render, например widget preload.

`afterRender` используй для analytics и неблокирующих effects, которым
действительно нужен состоявшийся render. Долгоживущие subscriptions размещай в
`setup`.

`onDemand` зарезервирован для явного runtime-запроса.

## Provider Для Widget Preload

Provider может подготовить widget runtime до первого render.

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

`context.scope` и `context.signal` использует `preload(...)`. Не дублируй их в
`props`. `props` должны описывать только widget props.
