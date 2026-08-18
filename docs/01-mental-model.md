# Ментальная Модель

`@tiyn/app` строит приложение как набор runtime-единиц. У каждой единицы есть
понятный владелец lifecycle, DI scope и cleanup.

Главная идея: React не управляет framework lifecycle. React показывает view и
вызывает hooks. Оркестрация, DI, policies, providers, revalidate и reporting
живут в runtime-классах.

## Карта Runtime

```text
Application
  root scope
  startup lifecycle
  router view
  frame layer

Router / Route
  URL matching
  route policies
  loader scheduling и controller runtime port
  route-level layouts, frames и exceptions

Module
  feature runtime для одного route leaf
  module scope
  controllers
  providers
  module view

Controller
  loader/action boundary для данных route module

Provider
  lifecycle side effects around module or frame startup

Widget
  reusable UI runtime
  widget scope
  widget controllers
  widget loader/action/revalidate

Frame
  presentation runtime, активируемый source
  обычно hash-driven drawer/modal-like flow
```

## Кто Чем Владеет

Каждый scope освобождает только свои resources:

```text
ApplicationScope
  root bindings
  app-level services
  application initializers disposables

ProviderScope
  provider-local bindings
  shared provider dependencies
  isolated provider instances

ModuleScope
  module bindings
  module controllers
  module provider pipeline

WidgetScope
  widget bindings
  widget controllers
  widget provider pipeline

FrameScope
  frame bindings
  frame provider pipeline
```

`ProviderScope` и scopes route/module/frame/widget являются соседними ветками
`ApplicationScope`:

```text
ApplicationScope
├── ProviderScope
└── RouteScope
    ├── ModuleScope
    ├── FrameScope
    └── WidgetScope
```

Поэтому provider может использовать application dependencies и собственные
bindings, но не получает module/frame/widget bindings через constructor. Данные
конкретного runtime передаются ему через `RuntimeProviderContextInterface`.

React mount/unmount может запустить adapter behavior, но не должен становиться
владельцем framework graph. Например, `WidgetHost` может создать widget runtime
при render, но dispose выполняет сам runtime.

## Declaration Не Равен Runtime

Decorators описывают metadata. Они не создают runtime и не выполняют бизнес
логику.

```ts
@UseBindings(OrdersBindings)
@Module({
  view: OrdersView,
})
export class OrdersModule {}
```

`OrdersModule` здесь является token и владельцем metadata. Runtime появится позже,
когда route загрузит module.

То же правило действует для widget:

```ts
@Widget<OrdersSummaryWidgetProps>({
  view: OrdersSummaryWidgetView,
})
export class OrdersSummaryWidget extends WidgetDefinition<OrdersSummaryWidgetProps> {}
```

и для frame:

```ts
@Frame({
  view: FrameView,
})
export class OrderDetailsFrame {}
```

## View-Слой

View-код использует hooks и declarative adapters:

```tsx
const navigate = useNavigate();
const orders = useLoaderData(OrdersControllerInterface);

return (
  <button type="button" onClick={() => navigate.frame.open(`/orders/${orders.items[0].id}`)}>
    Открыть детали
  </button>
);
```

View не должен самостоятельно искать runtime internals, route runtime или
controller instances. Для данных есть hooks, для команд есть hooks/adapters.

## Runtime-Слой

Controller, service и provider получают зависимости через constructor
injection:

```ts
@Controller()
export class OrdersController implements OrdersControllerInterface {
  constructor(
    @Inject(NavigateServiceInterface)
    private readonly navigateService: NavigateServiceInterface,
  ) {}
}
```

Runtime-код не должен зависеть от React hooks. Обычная navigation, browser
history и frame transition выполняются через единый `NavigateServiceInterface`.
Frame-операции сгруппированы в `navigate.frame`.

## Основные Потоки Данных

Route/module loader:

```text
React Router loader
-> RouteRuntime
-> ModuleRuntime
-> Controller.loader(args)
-> useLoaderData(ControllerToken)
```

Route/module action:

```text
useSubmit(ControllerToken)
-> RouteRuntime
-> ModuleRuntime
-> Controller.action(args)
```

React Router не используется как transport action. Payload остаётся обычным
значением JavaScript и передаётся в controller по исходной ссылке.

Произвольный метод controller:

```text
useController(ControllerToken).method(...args)
-> typed controller facade
-> nearest runtime
-> application RuntimeOperationCoordinator
-> Controller.method(...args)
```

`useSubmit(ControllerToken)` отдает общий action state для активного runtime
scope и controller token. Несколько вызовов hook в одном module view видят один
snapshot `inProcess` / `data` / `error`.

Widget loader:

```text
WidgetHost
-> WidgetRuntime
-> WidgetController.loader(args)
-> useLoaderData(WidgetControllerToken)
```

Widget action:

```text
useSubmit(WidgetControllerToken)
-> WidgetRuntime
-> WidgetController.action(args)
```

`useSubmit(WidgetControllerToken)` отдает общий action state для
активного widget runtime и controller token.

Frame activation:

```text
URL hash
-> active Route branch provides FrameRouter
-> FrameRouter matches FrameRoute
-> FrameRuntime runs providers and controllers
-> FrameLayer renders shell and view
```

На первом входе Route branch определяется до render. Route/Module и
FrameRouter/Frame начинают preload параллельно под общим application splash;
`FrameLayer` затем хостит уже подготовленный runtime. При hash-переходе после
первого render FrameLayer запускает новую frame-цепочку и показывает её
fallback.

Frame loader:

```text
FrameRuntime
-> FrameController.loader(args)
-> useLoaderData(FrameControllerToken)
```

Frame action:

```text
useSubmit(FrameControllerToken)
-> FrameRuntime
-> FrameController.action(args)
```

`useSubmit(FrameControllerToken)` отдает общий action state для активного
frame runtime и controller token.

Frame revalidate:

```text
useRevalidate()
or RevalidateServiceInterface
-> active FrameRuntime reloads frame controller data
```

## Инварианты

- Feature code импортирует API из `@tiyn/app`.
- Public declarations используют class tokens.
- View читает runtime data через hooks.
- Runtime-классы получают зависимости через DI.
- Providers описывают lifecycle side effects, а не заменяют бизнес-сервисы.
- Navigation и revalidate являются разными командами.
- Hash-only frame activation не revalidate-ит route loaders автоматически.
