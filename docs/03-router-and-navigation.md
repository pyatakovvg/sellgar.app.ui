# Router И Навигация

Router слой отвечает за URL, route tree, route policies, layouts, frames и
transport для loader/action. Feature-код не работает напрямую с React Router:
React Router используется внутри adapter-а.

## Router

`Router` содержит route tree и optional `baseUrl`.

```ts
new Router({
  baseUrl: import.meta.env['BASE_URL'],
  routes: [
    new Route({
      path: '/',
      routes: [
        new Route({
          path: '/orders',
          load: () => import('@module/orders'),
        }),
      ],
    }),
  ],
});
```

`baseUrl` можно не указывать, если приложение живет в корне.

## Route

`Route` бывает двух видов:

```text
branch route
  содержит child routes

leaf route
  загружает module через load()
```

`Route` принимает либо `routes`, либо `load`. Одновременно указывать оба поля
нельзя.

Branch route:

```ts
new Route({
  path: '/',
  layouts: [MainLayout],
  routes: [
    new Route({
      path: '/orders',
      load: () => import('@module/orders'),
    }),
  ],
});
```

Leaf route:

```ts
new Route({
  path: '/orders',
  load: () => import('@module/orders'),
});
```

Index route:

```ts
new Route({
  routes: [
    new Route({
      load: () => import('@module/home'),
    }),
  ],
});
```

Default route:

```ts
new Route({
  defaultTo: '/orders',
  layouts: [MainLayout],
  routes: [
    new Route({
      path: '/orders',
      load: () => import('@module/orders'),
    }),
  ],
});
```

`defaultTo` используется только на branch route. Если пользователь попал точно
на path этой группы, route loader делает `replace(defaultTo)` до providers,
module import, controller loaders и frame preload. Поэтому группа остается
layout/route boundary, а фактические процессы запускаются уже на целевом child
route.

Для групп, где статический default может быть недоступен из-за `canMatch`
дочерних routes, используй `Router.firstAvailable()`:

```ts
new Route({
  defaultTo: Router.firstAvailable(),
  layouts: [MainLayout],
  routes: [
    new Route({
      path: '/orders',
      canMatch: [AccessToOrders],
      load: () => import('@module/orders'),
    }),
    new Route({
      path: '/employees',
      canMatch: [AccessToEmployees],
      load: () => import('@module/employees'),
    }),
  ],
});
```

`Router.firstAvailable()` сначала выполняет `canMatch` текущей группы, затем без
redirect/forbidden side effects проверяет `canMatch` дочерних routes в порядке
объявления и делает `replace` на первый доступный child path. После перехода
целевой route проходит обычный lifecycle и все свои политики повторно. Если
доступного child route нет, loader возвращает `403`.

Невалидные формы:

- пустой `path`;
- пустой `defaultTo`;
- route без `routes` и без `load`;
- route одновременно с `routes` и `load`;
- `defaultTo` на leaf route;
- `defaultTo` вместе с index child route;
- duplicate child path;
- duplicate index route.

## Наследование Route

Дочерние routes наследуют:

- `canMatch`;
- `canActivate`;
- `canAction`;
- `layouts`;
- `frames`;
- `exception`, если child route или module не переопределили exception UI.
- `forbidden`, если child route не переопределил 403 UI.
- `notFound`, если child route не переопределил 404 UI.

Пример:

```ts
new Route({
  path: '/',
  canMatch: [RequireAuthenticatedSessionPolicy],
  frames: [OrderDetailsFrame],
  layouts: [MainLayout],
  routes: [
    new Route({
      path: '/orders',
      canActivate: [CanViewOrdersPolicy],
      load: () => import('@module/orders'),
    }),
  ],
});
```

Для `/orders` будут применены:

- `RequireAuthenticatedSessionPolicy`;
- `CanViewOrdersPolicy`;
- `MainLayout`;
- `OrderDetailsFrame`.

## Layouts

Layout - class token с metadata `@Layout(...)`.

```tsx
// src/auth.layout.tsx
import { Layout } from '@sellgar/app';

import { LayoutView } from './view';

@Layout({
  providers: [NavigationTabsPreloadProvider],
  view: LayoutView,
})
export class MainLayout {}
```

```tsx
// src/view/layout.view.tsx
export const LayoutView: React.FC<LayoutViewProps> = ({ children }) => {
  return (
    <main>
      <NavigationView />
      {children}
    </main>
  );
};
```

Файловая структура layout package описана в
[Структура layout package](./14-layout-package-structure.md).

Route layouts композируются вокруг active module view в порядке parent ->
child.

Layout может объявить `providers`, если layout владеет runtime-процессом,
например preload widget-а, который рендерится в самом layout. Layout providers
запускаются на route boundary этого layout и получают тот же route scope, в
котором потом рендерится `WidgetHost`.

Route layout одновременно задает boundary для своего subtree. Если пользователь
переходит между sibling/child routes внутри одного layout route, общий parent
layout остается mounted, а pending/exception UI отображается в ближайшем
route-level outlet ниже него.

Layout не должен рендерить frame infrastructure. `Application.createView()`
устанавливает `FrameLayer` глобально.

## Exception UI На Route

Route может объявить exception UI:

```ts
new Route({
  path: '/orders',
  exception: <OrdersRouteExceptionView />,
  load: () => import('@module/orders'),
});
```

Module-level `exception` может переопределить route exception для module
runtime.

Exception UI выбирается ближайшим route `errorElement` в active route branch.
Поэтому ошибка child route/module отображается внутри outlet ближайшего
route-level boundary, а не подменяет весь внешний layout. Например, если
`/terminals` и `/terminals/registrations` живут внутри общего
`TerminalMonitoringLayout`, ошибка `/terminals/registrations` должна
отображаться внутри `TerminalMonitoringLayout`, а не вместо parent
`NavigateLayout`.

Exception component читает ошибку через `useException()`:

```tsx
export const OrdersRouteExceptionView: React.FC = () => {
  const error = useException();

  return <pre>{String(error)}</pre>;
};
```

Route может объявить собственные `forbidden` и `notFound` UI.

## Fallback UI На Route

`fallback` показывает pending-состояние route content только при реальном
переходе на другой route segment внутри текущего route boundary. Повторный клик
по текущему пункту меню не подменяет контент fallback-ом: это считается
revalidation текущего route.

Fallback не должен пробивать общий parent layout. Если переход идет внутри
одного route subtree, fallback отображается в ближайшем child boundary, где
меняется route segment. Например, переход
`/terminals -> /terminals/registrations` сохраняет внешний `NavigateLayout` и
показывает fallback внутри `TerminalMonitoringLayout`.

Значение наследуется вниз по route-ветке: если у дочернего route нет своего
`fallback`, используется ближайший родительский, затем application-level
`components.fallback`.

```ts
new Route({
  fallback: <ReportsFallbackView />,
  path: '/reports',
  routes: [
    new Route({
      load: () => import('@module/reports'),
    }),
    new Route({
      fallback: <ReportDetailsFallbackView />,
      path: '/details',
      load: () => import('@module/report-details'),
    }),
  ],
});
```

Fallback рендерится внутри route layouts, поэтому layout shell не
пересоздаётся при переходе между соседними route-модулями.

`forbidden` используется для 403, которые возникают внутри route-ветки,
например через `Router.forbidden()`:

```ts
new Route({
  path: '/admin',
  forbidden: <AdminForbiddenView />,
  load: () => import('@module/admin'),
});
```

`notFound` используется для 404, которые возникают внутри route-ветки,
например через `Router.notFound()` или неизвестный child path внутри branch
route:

```ts
new Route({
  layouts: [MainLayout],
  notFound: <PrivateNotFoundView />,
  path: '/',
  routes: [
    new Route({
      load: () => import('@module/home'),
    }),
  ],
});
```

Отдельный `not-found` module для catch-all route не нужен: framework создаёт
внутренний 404 route для branch, где задан `notFound`.

## Location Во View

React view использует `useLocation()`.

```tsx
const location = useLocation();

location.pathname;
location.search;
location.searchParams;
location.hash;
location.hashParams;
location.params;
```

Матчинг текущего route без прямого импорта router adapter-а:

```tsx
const location = useLocation();

const isOrdersRoute = location.matches('/orders', { end: true });
const isOrdersBranch = location.matches('/orders');
```

Headless состояние пункта навигации:

```tsx
<NavItem to={'/orders'}>
  {({ isActive, isPending, to }) => (
    <button data-active={isActive} data-pending={isPending} onClick={() => navigate.to(to)}>
      Orders
    </button>
  )}
</NavItem>
```

`NavItem` не создаёт DOM wrapper. Он только вызывает render function и отдаёт
`isActive`, `isPending` и исходный `to`. `end` по умолчанию равен `true`; для
branch item можно передать `end={false}`. Если родительский compound component
клонирует direct child и прокидывает ему props, `NavItem` передаёт эти props в
элемент, который вернула render function. Pending-состояние учитывает `baseUrl`
router-а, заданный в `Router`.

Для route-local controls, которые должны реагировать на обновление текущего
route без навигационного пункта, используй `useRoutePending()`.

```tsx
const location = useLocation();
const navigate = useNavigate();
const routePending = useRoutePending();

<button onClick={() => navigate.to(`${location.pathname}${location.search}${location.hash}`)}>
  {routePending ? 'Refreshing' : 'Refresh'}
</button>;
```

Если control запускает runtime-local `useRevalidate()`, то pending нужно брать
из handler-а.

```tsx
const revalidate = useRevalidate();

<button disabled={revalidate.inProcess} onClick={revalidate}>
  Refresh
</button>;
```

DTO conversion для query string:

```ts
class OrdersFilterParams {
  @Expose()
  readonly page?: number;

  @Expose()
  readonly query?: string;
}
```

```tsx
const location = useLocation();
const filter = location.searchToObject(OrdersFilterParams, {
  enableTypeConversion: true,
});
```

DTO conversion для hash:

```tsx
const orderDetails = location.hashToObject(OrderDetailsFrameParams, {
  enableTypeConversion: true,
});
```

DTO conversion для route params:

```tsx
const params = location.paramsToObject(OrderRouteParams);
```

## Навигация Во View

React view использует `useNavigate()`.

```tsx
const navigate = useNavigate();

await navigate.to('/orders');
await navigate.replace('/sign-in');
await navigate.back();
```

Search params:

```tsx
await navigate.searchParams(
  {
    page: 2,
    query: 'paid',
  },
  {
    merge: true,
  },
);
```

Hash params:

```tsx
await navigate.hashParams({
  'order-details': {
    id: '100',
  },
});
```

Удаление hash key:

```tsx
await navigate.hashParams({
  'order-details': undefined,
});
```

## Location В Runtime-Коде

Controller, provider, policy и service используют DI service:

```ts
@Injectable()
export class OrdersFilterService {
  constructor(
    @Inject(LocationServiceInterface)
    private readonly locationService: LocationServiceInterface,
  ) {}

  getFilter(): OrdersFilterParams {
    return this.locationService.searchToObject(OrdersFilterParams, {
      enableTypeConversion: true,
    });
  }
}
```

`LocationServiceInterface` открывает:

```ts
locationService.location;
locationService.subscribe(listener);
locationService.searchToObject(OrdersFilterParams);
locationService.hashToObject(OrderDetailsFrameParams);
locationService.paramsToObject(OrderRouteParams);
locationService.matches('/orders', { end: true });
```

`location` может быть `null` до синхронизации router adapter-а.

## Навигация В Runtime-Коде

```ts
@Injectable()
export class OrdersNavigationService {
  constructor(
    @Inject(NavigateServiceInterface)
    private readonly navigateService: NavigateServiceInterface,
  ) {}

  async openOrders(): Promise<void> {
    await this.navigateService.to('/orders');
  }

  async updateFilter(filter: OrdersFilterParams): Promise<void> {
    await this.navigateService.searchParams(filter, {
      merge: true,
    });
  }
}
```

`NavigateServiceInterface` открывает:

```ts
navigateService.to('/orders');
navigateService.replace('/sign-in');
navigateService.back();
navigateService.searchParams({ page: 1 });
navigateService.hashParams({ 'order-details': { id: '100' } });
```

## Навигация Не Равна Revalidate

Navigation меняет URL state. Revalidate обновляет active data.

Hash-only navigation не запускает route loaders автоматически:

```ts
await navigateService.hashParams({
  'order-details': {
    id,
  },
});

await revalidateService.revalidate(OrdersController);
```

Если flow после navigation должен обновить данные, вызывай revalidate явно.
