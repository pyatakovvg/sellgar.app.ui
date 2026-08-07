# Приложение

`Application` - корневая runtime-единица приложения.

Она отвечает за:

- root DI scope;
- bindings, объявленные через `@UseBindings`;
- startup initializers;
- session runtime state;
- application store;
- router view;
- global frame layer;
- runtime error reporting;
- dispose root runtime.

Она не должна знать feature-specific детали: какие controllers есть у module,
как widget грузит данные, какие domain services нужны конкретному экрану.

Framework создает рядом с runtime-веткой отдельный `ProviderScope`. Application
не перечисляет bindings конкретных providers: provider подключает их сам через
`@UseBindings(...)`, только когда появляется в `providers: [...]`.

## Контракт

```ts
export abstract class Application extends ApplicationControllerInterface {
  get lifecycle(): ApplicationLifecycleSnapshot;

  compose(): void;

  initialize(): Promise<void>;

  createView(): React.FC;

  dispose(): Promise<void>;

  subscribe(listener: () => void): () => void;

  protected abstract configure(app: ApplicationConfiguratorInterface): void;
}
```

## Порядок Запуска

```text
new Application()
-> compose()
-> initialize()
-> createView()
-> React render
-> dispose()
```

`compose()` выполняется синхронно. На этой стадии активируется root scope,
подключаются bindings и сохраняется декларативная конфигурация.

`initialize()` выполняется асинхронно. На этой стадии запускаются application
initializers. После успешного завершения application переходит в `ready`.

`createView()` возвращает React component для уже скомпонованного application.
Этот component показывает splash, exception или router view в зависимости от
application lifecycle.

## Пример Приложения

```tsx
@UseBindings(AppBindings)
export class OrdersApplication extends Application {
  protected configure(app: ApplicationConfiguratorInterface): void {
    app.components({
      exception: <AppExceptionView />,
      forbidden: <ForbiddenView />,
      notFound: <NotFoundView />,
      splash: <SplashView />,
    });

    app.initializers([
      ResolveRuntimeConfigInitializer,
      Initializers.parallel([ResolveSessionInitializer, ResolveFeatureFlagsInitializer]),
    ]);

    app.layouts([MainLayout]);

    app.router(
      new Router({
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
      }),
    );
  }
}
```

## Bootstrap

Если startup должен завершиться до первого render:

```tsx
const app = new OrdersApplication();

app.compose();
await app.initialize();

const AppView = app.createView();

createRoot(document.querySelector('#root')!).render(<AppView />);
```

Если нужно показать splash во время startup:

```tsx
const app = new OrdersApplication();

app.compose();

const AppView = app.createView();

void app.initialize();

createRoot(document.querySelector('#root')!).render(<AppView />);
```

Во втором варианте `AppView` будет показывать `components.splash`, пока
application не перейдет в `ready` или `failed`.

## UI-Слоты

`app.components(...)` задает application-level UI slots:

```ts
app.components({
  splash: <SplashView />,
  exception: <AppExceptionView />,
  forbidden: <ForbiddenView />,
  notFound: <NotFoundView />,
  fallback: <RouteFallbackView />,
});
```

`splash` используется до `ready`.

`exception` используется при application startup failure.

`forbidden`, `notFound` и `fallback` используются router adapter-ом для
соответствующих route states.

Route/module exception UI настраивается отдельно на `Route` или `@Module`.

## Инициализаторы

Application initializer - DI-managed class с методом `execute(...)`.

```ts
@Initializer()
export class ResolveSessionInitializer extends ApplicationInitializerInterface {
  constructor(
    @Inject(SessionGatewayInterface)
    private readonly sessionGateway: SessionGatewayInterface,
  ) {
    super();
  }

  async execute(context: ApplicationInitializerContextInterface): Promise<void> {
    const session = await this.sessionGateway.resolve({
      signal: context.signal,
    });

    if (session.authenticated) {
      context.session.setAuthenticated();
      return;
    }

    context.session.setAnonymous();
  }
}
```

Context initializer-а:

```ts
interface ApplicationInitializerContextInterface {
  readonly app: ApplicationControllerInterface;
  readonly disposables: DisposableRegistryInterface;
  readonly session: SessionRuntimeStateInterface;
  readonly signal: AbortSignal;
}
```

`signal` нужно передавать в async операции. При `dispose()` application abort-ит
активные initializers.

`disposables` нужен для application-level subscriptions к контрактам, которыми
владеет initializer:

```ts
execute(context: ApplicationInitializerContextInterface): void {
  context.disposables.add(runtimeConfig.subscribe(() => this.applyConfig()));
}
```

Initializer не получает глобальную подписку на runtime failures. Ошибка его
`execute()` относится к application activation и переводит application в
`failed`; штатные HTTP/session outcomes маршрутизирует application-scoped
`RequestExecutorInterface`.

## Порядок Инициализаторов

Внешний массив выполняется последовательно:

```ts
app.initializers([ResolveRuntimeConfigInitializer, ResolveSessionInitializer, ResolveFeatureFlagsInitializer]);
```

`Initializers.parallel(...)` создает параллельную blocking stage:

```ts
app.initializers([
  ResolveRuntimeConfigInitializer,
  Initializers.parallel([ResolveSessionInitializer, ResolveFeatureFlagsInitializer]),
]);
```

В примере сначала выполняется `ResolveRuntimeConfigInitializer`, затем
параллельно выполняются session и feature flags. Следующая стадия началась бы
только после завершения обеих задач.

## Store Приложения

`ApplicationStoreInterface` хранит resolved application-level data по class key.

```ts
@Initializer()
export class ResolveProfileInitializer extends ApplicationInitializerInterface {
  constructor(
    @Inject(ApplicationStoreInterface)
    private readonly store: ApplicationStoreInterface,
    @Inject(ProfileGatewayInterface)
    private readonly profileGateway: ProfileGatewayInterface,
  ) {
    super();
  }

  async execute(context: ApplicationInitializerContextInterface): Promise<void> {
    const profile = await this.profileGateway.getProfile({
      signal: context.signal,
    });

    this.store.set(ProfileEntity, profile);
  }
}
```

Операции:

```ts
store.set(ProfileEntity, profile);
store.get(ProfileEntity);
store.setMany(PermissionEntity, permissions);
store.getMany(PermissionEntity);
store.has(ProfileEntity);
store.delete(ProfileEntity);
store.clear();
```

Store не владеет смыслом данных. Он не знает, когда нужно очищать profile,
permissions или tenant. Logout, tenant switch и другие сценарии должны чистить
свои entries явно.

## Runtime-Состояние Session

`SessionRuntimeStateInterface` хранит только phase:

```ts
type SessionRuntimePhase = 'anonymous' | 'authenticated' | 'unknown';
```

API:

```ts
session.phase;
session.setUnknown();
session.setAnonymous();
session.setAuthenticated();
session.subscribe(listener);
```

Не складывай profile, permissions, tenant или feature flags в session state.
Для этих данных используй `ApplicationStoreInterface`.
