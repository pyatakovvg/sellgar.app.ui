# Guards

Guards защищают local capabilities внутри уже активного runtime.

Policy отвечает за route boundary: можно ли матчить route, загрузить module,
активировать branch или выполнить route action. Guard отвечает за локальный
доступ: можно ли показать UI, выполнить controller loader/action, widget action
или frame action.

## Contract

Guard является DI service. Concrete guard class можно пометить `@Guard()`,
тогда runtime auto-bind-ит его в текущем scope при первом использовании.

```ts
export interface CanViewOrdersGuardContext {
  readonly section: string;
}

@Guard()
export class CanViewOrdersGuard extends GuardInterface<CanViewOrdersGuardContext> {
  constructor(
    @Inject(CurrentPermissionsStoreInterface)
    private readonly permissions: CurrentPermissionsStoreInterface,
  ) {
    super();
  }

  execute(context: CanViewOrdersGuardContext): GuardResult {
    return this.permissions.canView(context.section);
  }
}
```

Guard возвращает `true` или `false`. Исключение внутри guard считается настоящей
ошибкой выполнения guard, а не отказом доступа. Для отказа доступа возвращай
`false`.

## Combining

Любое место, принимающее guard declaration, принимает один guard или массив
guards. `@UseGuards(...)` также принимает несколько declarations аргументами.

```ts
@UseGuards([CanViewOrdersGuard, CanViewArchivedOrdersGuard])
async loader(args: ControllerLoaderArgs): Promise<OrdersLoaderData> {
  return this.ordersService.getOrders(args);
}
```

```ts
@UseGuards(CanViewOrdersGuard, CanViewArchivedOrdersGuard)
async loader(args: ControllerLoaderArgs): Promise<OrdersLoaderData> {
  return this.ordersService.getOrders(args);
}
```

Массив выполняется как `AND/all`:

```text
guards run in declaration order
first false stops the chain
all true allows the operation
```

`OR/any` пока не является частью public API. Если нужен альтернативный доступ,
создай отдельный guard, который инкапсулирует это правило внутри себя.

## Failure Strategy

По умолчанию отказ guard бросает `GuardRejectedException`.

```text
default failureStrategy = GuardFailure.throw()
```

Доступные стратегии:

```ts
GuardFailure.throw();
GuardFailure.returnValue(value);
GuardFailure.returnNull();
GuardFailure.returnUndefined();
```

Configured declaration:

```ts
@UseGuards(CanViewFinanceGuard.configure().failureStrategy(GuardFailure.returnNull()))
async loader(): Promise<FinanceLoaderData | null> {
  return this.financeService.getData();
}
```

Если в массиве guards один guard вернул `false`, применяется стратегия именно
этого guard. Последующие guards не выполняются.

## Controller Decorator

`@UseGuards(...)` является metadata decorator. Он не оборачивает метод сам по
себе и не является generic method interceptor.

Framework читает metadata только на своих controller boundaries:

```text
module controller loader/action
widget controller loader/action
frame controller loader/action
```

```ts
@Injectable()
export class OrdersController extends OrdersControllerInterface {
  constructor(
    @Inject(OrdersServiceInterface)
    private readonly ordersService: OrdersServiceInterface,
  ) {
    super();
  }

  @UseGuards(CanViewOrdersGuard)
  async loader(args: ControllerLoaderArgs): Promise<OrdersLoaderData> {
    return this.ordersService.getOrders({
      signal: args.request.signal,
    });
  }
}
```

Декоратор ставится на concrete method реализации controller-а. Не используй его
на private helpers или services: framework не вызывает такие методы как runtime
boundary и не будет читать их guard metadata.

## Hook

`useGuard(...)` проверяет guard в текущем runtime scope.

```tsx
export const OrdersToolbar: React.FC = () => {
  const canCreate = useGuard(CanCreateOrderGuard, {
    section: 'orders',
  });

  return canCreate ? <button type="button">Создать</button> : null;
};
```

Hook предназначен для UX-состояния: show/hide, enable/disable. Он не заменяет
controller decorator или route policy enforcement.

## Guarded

`Guarded` является declarative wrapper вокруг `useGuard(...)`.

```tsx
<Guarded
  by={[CanViewOrdersGuard, CanCreateOrderGuard]}
  context={{
    section: 'orders',
  }}
>
  <button type="button">Создать</button>
</Guarded>
```

`fallback` отображается при отказе guard:

```tsx
<Guarded by={CanViewOrdersGuard} fallback={<span>Нет доступа</span>}>
  <OrdersTable />
</Guarded>
```

`Guarded` также использует `AND/all` для массива guards.
