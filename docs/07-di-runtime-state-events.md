# DI, Runtime-Состояние И События

Этот раздел описывает support API, которое используется во всех runtime
слоях: application, modules, widgets и frames.

## DI Facade

Feature code использует DI API из `@sellgar/app`:

```ts
import { BindingModuleInterface, Inject, Injectable, Optional, UseBindings } from '@sellgar/app';
```

Не импортируй decorators напрямую из `inversify`. Framework facade нужен, чтобы
feature code не зависел от конкретной DI implementation.

## Binding Module

Bindings объявляются в class, который наследует `BindingModuleInterface`.

```ts
export class OrdersBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(OrdersServiceInterface).to(OrdersService).inSingletonScope();
    registry.bind(OrdersController).toSelf().inTransientScope();
    registry.bind(UpdateOrderFilterController).toSelf().inTransientScope();
  }
}
```

Доступные операции:

```ts
registry.bind(Token).to(Implementation).inSingletonScope();
registry.bind(Token).to(Implementation).inTransientScope();
registry.bind(Token).to(Implementation).inRequestScope();
registry.bind(Token).toSelf().inTransientScope();
registry.bind(Token).toConstantValue(value);
registry.bind(Token).toService(ExistingToken);
```

## UseBindings

`@UseBindings(...)` связывает binding modules с declaration token.

Application:

```ts
@UseBindings(AppBindings)
export class OrdersApplication extends Application {}
```

Module:

```tsx
@UseBindings(OrdersBindings)
@Module({
  view: OrdersView,
})
export class OrdersModule {}
```

Widget:

```tsx
@UseBindings(OrdersSummaryWidgetBindings)
@Widget<OrdersSummaryWidgetProps>({
  view: OrdersSummaryWidgetView,
})
export class OrdersSummaryWidget extends WidgetDefinition<OrdersSummaryWidgetProps> {}
```

Provider:

```ts
@UseBindings(OrdersEventsBindings)
@Provider()
export class OrdersEventsProvider extends RuntimeProviderInterface {}
```

Decorator только записывает metadata. Runtime scopes сами активируют и
освобождают bindings.

Bindings provider-а активируются в общем `ProviderScope` по факту появления
provider pipeline. Повторное использование одного binding module удерживает его
по constructor identity и не выполняет повторную регистрацию. Последний
завершившийся pipeline освобождает binding module.

## Injection

```ts
@Injectable()
export class OrdersController extends OrdersControllerInterface {
  constructor(
    @Inject(OrdersServiceInterface)
    private readonly ordersService: OrdersServiceInterface,
    @Optional()
    @Inject(OrdersTelemetryInterface)
    private readonly telemetry?: OrdersTelemetryInterface,
  ) {}
}
```

В качестве tokens предпочтительны abstract classes:

```ts
export abstract class OrdersServiceInterface {
  abstract getOrders(options: { readonly signal?: AbortSignal }): Promise<readonly OrderEntity[]>;
}
```

Так token одновременно является DI key и источником TypeScript-типа.

## Runtime Scopes

Framework использует внутренние scope classes:

```ts
ApplicationScope;
ProviderScope;
ModuleScope;
WidgetScope;
FrameScope;
RuntimeScope;
```

Scope classes и их lifecycle API не экспортируются из root facade. Feature code
не создаёт scopes вручную: activation принадлежит runtime-классам.

`ProviderScope` является дочерним только для `ApplicationScope` и соседним для
route/module/frame/widget scopes. Поэтому provider-local bindings не попадают в
runtime scopes, а локальные runtime bindings не становятся constructor
dependencies provider-а.

React DI facade:

```tsx
const service = useDependency(OrdersServiceInterface);
```

`useDependency(...)` допустим для framework/runtime dependencies или
осознанного escape hatch. Не используй его вместо `useLoaderData(...)` или
`useLoaderData(...)`.

## Store Приложения

`ApplicationStoreInterface` хранит resolved application-level data по class key.

Single value:

```ts
this.store.set(ProfileEntity, profile);
const profile = this.store.get(ProfileEntity);
```

Collection value:

```ts
this.store.setMany(PermissionEntity, permissions);
const permissions = this.store.getMany(PermissionEntity);
```

Удаление:

```ts
this.store.delete(ProfileEntity);
this.store.clear();
```

Store не выполняет автоматическую очистку по logout, tenant switch или смене
session phase. Сценарий, который владеет данными, должен очищать их явно.

## Runtime-Состояние Session

Session runtime state хранит только phase:

```ts
type SessionRuntimePhase = 'anonymous' | 'authenticated' | 'unknown';
```

API:

```ts
context.session.setUnknown();
context.session.setAnonymous();
context.session.setAuthenticated();
context.session.phase;
```

Profile, permissions, tenant и feature flags относятся к resolved data. Для них
используй `ApplicationStoreInterface`, а не `SessionRuntimeStateInterface`.

## Event Bus Приложения

Application event bus - integration layer для независимых runtime participants.

Event token:

```ts
export abstract class OrderUpdatedEvent {
  declare readonly id: string;
}
```

Publish:

```ts
@Injectable()
export class UpdateOrderController implements ControllerInterface {
  constructor(
    @Inject(ApplicationEventBusInterface)
    private readonly eventBus: ApplicationEventBusInterface,
  ) {}

  async action(args: ControllerActionArgs<{ readonly id: string }>): Promise<void> {
    await this.eventBus.publish(OrderUpdatedEvent, {
      id: args.payload.id,
    });
  }
}
```

Subscribe:

```ts
@Provider()
export class OrdersEventsProvider implements RuntimeProviderInterface {
  constructor(
    @Inject(ApplicationEventBusInterface)
    private readonly eventBus: ApplicationEventBusInterface,
  ) {}

  setup(): RuntimeProviderResult {
    const eventScope = this.eventBus.createScope().subscribe(OrderUpdatedEvent, this.handleOrderUpdated.bind(this));

    return () => eventScope.dispose();
  }

  private handleOrderUpdated(event: OrderUpdatedEvent): void {
    console.info(event.id);
  }
}
```

`subscribe(...)` возвращает disposable subscription и подходит для одного
точечного listener-а. Если owner подписывается на одно или несколько событий и
сам владеет cleanup, используй `createScope()`:

```ts
@Injectable()
export class OrdersController implements ControllerInterface {
  private readonly eventScope: ApplicationEventScope;

  constructor(
    @Inject(ApplicationEventBusInterface)
    private readonly eventBus: ApplicationEventBusInterface,
    @Inject(RevalidateServiceInterface)
    private readonly revalidateService: RevalidateServiceInterface,
  ) {
    this.eventScope = this.eventBus
      .createScope()
      .subscribe(OrderCreatedEvent, this.revalidate.bind(this))
      .subscribe(OrderUpdatedEvent, this.revalidate.bind(this))
      .subscribe(OrderDeletedEvent, this.revalidate.bind(this));
  }

  dispose(): void {
    this.eventScope.dispose();
  }

  private async revalidate(): Promise<void> {
    await this.revalidateService.revalidate(OrdersController);
  }
}
```

`ApplicationEventScope` нужен, чтобы controller/provider не хранил массив
subscriptions и не выполнял ручной цикл dispose. Scope disposable и idempotent:
повторный `dispose()` ничего не делает, а новые подписки после dispose
запрещены.

Bus поддерживает function handlers и class handlers, реализующие
`ApplicationEventHandlerInterface<TEvent>`.

Ошибки handlers репортятся через runtime reporter. Publisher не должен знать,
кто подписан на событие.
