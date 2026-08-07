# Аудит Публичного API `@tiyn/app`

Дата сверки: 2026-07-28.

Документ фиксирует результат размещения документации в `library/tiyn-app/docs`
и сверки с текущим пакетом `library/tiyn-app`.

## Источники

- `library/tiyn-app/src/index.ts` - публичный API пакета.
- `library/tiyn-app/src/*` - реализация runtime-срезов.
- Тесты рядом с runtime-срезами - поведенческая проверка контракта.
- `library/tiyn-app/types` - generated/build artifact, не источник истины.

## Статус Перенесённых Документов

Документы `00-quick-start.md` ... `16-application-host-structure.md` перенесены
как рабочее руководство по текущему API. Сверка показала, что основные контракты
в них соответствуют публичным экспортам:

- Жизненный цикл приложения: `Application`, `ApplicationConfiguratorInterface`,
  initializers, `ApplicationStoreInterface`, `SessionRuntimeStateInterface`;
- DI facade: `BindingModuleInterface`, `BindingRegistryInterface`,
  `UseBindings`, `Inject`, `Injectable`, `Optional`, `MultiInject`;
- Router: `Router`, `Route`, route policies, location/navigate services,
  search/hash utils;
- Modules/controllers: `@Module`, controller loader/action contracts,
  `useController`, `useLoaderData`, `useSubmit`, `useRevalidate`,
  `RevalidateServiceInterface`;
- Widgets: `@Widget`, `WidgetDefinition`, `WidgetHost`, widget runtime factory,
  unified controller hooks and runtime-local revalidate;
- Frames: `@Frame`, `FrameDefinition`, `FrameShellInterface`,
  `HashFrameSource`, `FrameServiceInterface`, unified controller hooks и
  runtime-local revalidate;
- Runtime providers: `@Provider`, `RuntimeProviderInterface`,
  `@SingletonProvider`, `SingletonProviderInterface`,
  `RuntimeProviderResult`, `RuntimeProviderCleanup`;
- Runtime failures: source-aware reports и output-only
  `RuntimeFailureSinkInterface`;
- Policies/guards: `Policy`, `PolicyInterface`, `PolicyDescriptorBuilder`,
  `Guard`, `GuardInterface`, `UseGuards`, `useGuard`, `Guarded`;
- Reactive entities: `Entity`, `EntityConstructor`, `EntityIdentity`,
  `EntityMetadata`, `EntityOptions`, `updateEntity`, `reactive`;
- Встроенные features: notification и user-request.

## Граница Публичного API

Код фич должен импортировать framework API из корня пакета:

```ts
import { Application, Module, Route, Router } from '@tiyn/app';
```

Не считать стабильным публичным контрактом:

- внутренности React Router adapter;
- `FrameLayer`;
- route object builder;
- module export resolver;
- runners и pipeline classes, которые не экспортируются из `src/index.ts`;
- concrete runtime/state-machine classes, scope classes, bindings
  implementations и metadata readers;
- direct scope access, включая `useRuntimeScope`; React-код получает dependency
  через `useDependency(...)`;
- framework-owned adapter components, lifecycle helpers и default
  implementations: `RevalidateBridge`, `renderView`,
  `ApplicationInitializerGroup`, router continuation service и concrete
  runtime reporters;
- файлы под `types/`.

## Карта Локальных AGENTS.md

Корневой `library/tiyn-app/AGENTS.md` является маршрутизатором по слоям. Для
изменений открывать ближайший локальный документ:

- `src/application/AGENTS.md` - lifecycle приложения, config, initializers,
  store, session, events, reporting.
- `src/router/AGENTS.md` - declarations/router runtime, services, params,
  search/hash utils.
- `src/module/AGENTS.md` - `@Module`, metadata, lazy resolution, module runtime.
- `src/widget/AGENTS.md` - `@Widget`, `WidgetHost`, widget runtime/factory/hooks.
- `src/frame/AGENTS.md` - `@Frame`, sources, navigation state, service/runtime.
- `src/runtime/AGENTS.md` - scopes, providers, operation flow и context.
- `src/controller/AGENTS.md` - generic controller contracts, action transport,
  loader data и hooks.
- `src/di/AGENTS.md` - DI facade, tokens, bindings, `UseBindings`, decorators.
- `src/policy/AGENTS.md` - policy contracts, descriptors, handlers, runner.
- `src/guard/AGENTS.md` - guards, `UseGuards`, runner, hook, `Guarded`.
- `src/layout/AGENTS.md` - `@Layout` и generic layout rendering.
- `src/revalidate/AGENTS.md` - unified revalidate service, runtime-local
  implementation и bridge.
- `src/react/AGENTS.md` - React Router adapter, exception/pending/view helpers.
- `src/reactive/AGENTS.md` - reactive entity declarations, identity metadata и
  observable runtime.
- `src/features/AGENTS.md` - встроенные features.
- `src/features/notification/AGENTS.md` - notification фича.
- `src/features/user-request/AGENTS.md` - user request фича.

## Что Требует Осторожности

- `FrameLayer` упоминается в документах как внутренний механизм render layer.
  Его не нужно импортировать из кода фич.
- Frame navigation history принадлежит `frame-navigation-state` в
  `sessionStorage`, с областью по `router.baseUrl`; `history.state` не является
  источником истины.
- `WidgetRuntimeFactoryInterface.preload(...)` готовит widget runtime для
  владельца scope и `runtimeKey`; `WidgetHost` может использовать подготовленный
  runtime, но не должен знать детали его реализации.
- Revalidate использует единый service token, но конкретная реализация берётся
  из ближайшего module/frame/widget runtime scope.
- Guards - local capability checks внутри активного runtime; route boundary
  остаётся ответственностью policies.

## Правило Обновления

При изменении `src/index.ts`, деклараций `@Module`/`@Widget`/`@Frame`/`@Layout`,
router contracts, providers, guards, policies, revalidate или встроенные features
обновлять соответствующий документ в `library/tiyn-app/docs` в том же изменении.
