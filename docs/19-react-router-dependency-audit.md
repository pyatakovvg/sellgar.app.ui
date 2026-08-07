# Аудит Зависимости `@tiyn/app` От React Router

- Статус документа: аналитический снимок
- Дата аудита: 2026-08-05
- Область: `library/tiyn-app` и его production-потребители в management panel
- Изменения runtime/API: отсутствуют

Документ фиксирует текущее проникновение пакетов `react-router` и
`react-router/dom` в архитектуру `@tiyn/app` и границы, которые потребуется
изменить перед появлением другого способа управления экранными сценариями, в
частности FSM adapter.

Это не утверждённый design и не план реализации. К нему следует вернуться перед
проектированием router/runtime abstraction и сверить выводы с актуальным кодом.

## Итог

Зависимость `@tiyn/app` от React Router является архитектурной и критической.
React Router сейчас не только сопоставляет URL с view. Он фактически выполняет
роль execution kernel для module runtime:

- выбирает активную route branch;
- планирует loaders и actions;
- предоставляет cancellation через `request.signal`;
- определяет момент commit подготовленного runtime;
- запускает revalidation;
- предоставляет pending/navigation state;
- реализует redirects и error propagation;
- сообщает framework, какие route runtimes стали активными.

Поэтому заменить React Router только другой реализацией текущего класса `Router`
невозможно. `Application` всё равно создаст React Router view, а module lifecycle
останется зависимым от React Router loaders, actions и matches.

Вытеснение React Router в adapter возможно без изменения прикладной модели
`Application -> runtime entity -> Controller -> View`, но потребует существенной
перестройки внутренних runtime boundaries.

Условная оценка зависимости: **высокая, около 8/10**.

## Масштаб Прямых Зависимостей

На момент аудита в `src` найдено девять production-файлов с прямым импортом
React Router:

1. `src/react/router/adapter/react-router-adapter.tsx`;
2. `src/react/router/adapter/route-object-builder.tsx`;
3. `src/router/runtime/route-runtime/route-runtime.ts`;
4. `src/router/runtime/route-runtime-context/route-runtime-context.interface.ts`;
5. `src/controller/react/use-controller-submit/use-controller-submit.hook.ts`;
6. `src/revalidate/react/revalidate-bridge/revalidate-bridge.tsx`;
7. `src/react/router/exception/route-exception-boundary.tsx`;
8. `src/react/router/pending/route-pending-boundary.tsx`;
9. `src/react/router/use-route-pending/use-route-pending.hook.ts`.

Также найдено восемь test-файлов с прямой зависимостью от React Router и пять
production-файлов management panel, напрямую использующих `NavLink`.

Небольшое количество импортов не означает слабую связанность. Эти импорты
расположены в узлах, определяющих lifecycle всего module runtime.

## Фактическая Схема Выполнения

```text
Application
  -> createReactRouterView()
    -> createBrowserRouter()
      -> route matching
      -> loader scheduling
      -> action scheduling
      -> cancellation через request.signal
      -> active matches
      -> pending/navigation state
      -> revalidation
      -> redirect/replace
      -> error boundary propagation
        -> RouteRuntime
          -> policies
          -> ModuleRuntime activation
          -> provider pipeline
          -> controller loaders/actions
          -> commit/discard/dispose
          -> frame availability
```

React Router тем самым определяет не только навигацию, но и протокол выполнения
framework runtime.

## Карта Связанности

| Уровень | Текущая зависимость | Критичность |
| --- | --- | --- |
| `Application.createView` | Всегда создаёт React Browser Router | критическая |
| Route activation/commit | Активная ветка определяется `useMatches()` | критическая |
| Module loader/action | RR loaders, actions, `Request`, fetcher | критическая |
| Redirect/error flow | Thrown redirects, responses и RR error boundaries | высокая |
| Revalidation | RR revalidator для modules/application | высокая |
| Pending/fallback | RR navigation state и URL segments | высокая |
| Frames | Active routes, URL hash и browser location | высокая |
| Policies | Контракт близок к нейтральному, исполнение RR-specific | средняя |
| Location/navigation | Скрыты за DI, но полностью URL-oriented | средняя |
| Layout inheritance | Почти нейтрально, но собирается RR route builder | средняя |
| DI/scopes/runtime operations | Не зависят от RR | низкая |
| Widget runtime | Практически router-neutral | низкая |
| Прикладные controllers | Не используют transport args | низкая |

## Application Жёстко Создаёт React Router

`Application` самостоятельно:

- создаёт `RouterRuntime`;
- подключает `RouterServiceBindings`;
- хранит конкретный `Router` в config;
- вызывает `createReactRouterView()` внутри `createView()`;
- освобождает `RouterRuntime` при dispose.

См.:

- [`application.tsx`](../src/application/lifecycle/application/application.tsx);
- [`application-configurator.interface.ts`](../src/application/config/application-configurator/application-configurator.interface.ts);
- [`react-router-adapter.tsx`](../src/react/router/adapter/react-router-adapter.tsx).

Точки подмены runtime adapter сейчас нет. Даже новая реализация декларации
`Router` не сможет изменить host/runtime механизм.

## React Router Владеет Commit Протоколом

React Router adapter получает активные matches через `useMatches()` и передаёт
их идентификаторы в `RouterRuntime.syncActiveRoutes()`.

Далее `RouterRuntime`:

- вызывает `commit()` у runtime активных routes;
- вызывает `discardPending()` у неподтверждённых runtime;
- освобождает runtime вышедших из active branch;
- вычисляет доступные frames по активным route IDs.

Получается транзакционный lifecycle:

```text
prepare -> load -> выбор активной branch -> commit
                    не выбрана       -> discard
                    была активна      -> dispose
```

FSM adapter должен либо воспроизводить эту семантику, либо передавать
универсальному runtime coordinator только результаты сопоставления. Adapter не
должен сам оставаться владельцем framework lifecycle.

См. [`router-runtime.ts`](../src/router/runtime/router-runtime/router-runtime.ts).

## `RouteRuntime` Является React Router Runtime

Несмотря на расположение в `src/router/runtime`, `RouteRuntime` непосредственно
использует:

- `LoaderFunctionArgs`;
- `ActionFunctionArgs`;
- `redirect()`;
- `replace()`;
- Web `Request` из RR loader/action;
- URL из `request.url`;
- cancellation из `request.signal`;
- thrown `Response` для `403` и `404`.

Он также:

- синхронизирует framework location;
- выполняет route policies;
- активирует и загружает `ModuleRuntime`;
- парсит controller action из HTTP-подобного запроса;
- реализует `defaultTo` и `firstAvailable`;
- сохраняет и восстанавливает URL для authentication continuation;
- подготавливает frame runtimes;
- переводит policy decisions в React Router exceptions.

Это самая сильная точка связанности. Сначала здесь должен появиться
router-neutral activation protocol, а преобразование в RR loader/action response
должно перейти в React Router adapter.

См. [`route-runtime.ts`](../src/router/runtime/route-runtime/route-runtime.ts).

## Controller И Provider Context Транспортно-Зависимы

Module controller получает:

```ts
interface ControllerLoaderArgs {
  params: Record<string, string | undefined>;
  request: Request;
}

interface ControllerActionArgs<TPayload> {
  params: Record<string, string | undefined>;
  payload: TPayload;
  request: Request;
}
```

Проблемы текущего контракта:

- cancellation скрыта в `request.signal`;
- `Request` подразумевает HTTP/URL transport;
- `params` подразумевает URL matching;
- FSM snapshot не обязан иметь URL, `Request` или route params.

`RuntimeProviderContextInterface` и frame controller args также содержат URL
params и `Request`, хотя уже имеют отдельный `AbortSignal`.

При этом проверка production controllers management panel показала:

- `args.request` не используется;
- `args.params` не используется;
- `args.signal` не используется;
- используются преимущественно `payload` и frame/widget `props`.

Таким образом, публичный type contract протёк сильно, но фактическая прикладная
зависимость от transport args пока низкая. Это снижает риск миграции аргументов.

См.:

- [`controller.interface.ts`](../src/controller/contract/controller/controller.interface.ts);
- [`runtime-provider.interface.ts`](../src/runtime/provider/runtime-provider/runtime-provider.interface.ts);
- [`frame-controller.interface.ts`](../src/frame/runtime/frame-controller/frame-controller.interface.ts).

## Module Action Использует React Router Как Message Bus

Для module controller `useSubmit()` вызывает RR `useFetcher()`:

1. controller token и payload сериализуются в JSON;
2. добавляются поля `__tiynAppController`, `__tiynAppSubmitId` и
   `__tiynAppPayload`;
3. `fetcher.submit()` направляет запрос в route action;
4. `RouteRuntime.action()` снова разбирает `Request`;
5. результат или ошибка помещаются в envelope;
6. hook сопоставляет ответ с submit ID.

Этот HTTP-подобный transport является внутренним вызовом controller, а не
реальной сетевой границей.

Frame и widget runtime уже используют более нейтральную схему:

```text
useSubmit -> runtime.action(controllerToken, payload)
```

Их action state хранится самим runtime. Этот механизм является готовым образцом
для module actions.

См.:

- [`use-controller-submit.hook.ts`](../src/controller/react/use-controller-submit/use-controller-submit.hook.ts);
- [`controller-action-request.ts`](../src/controller/action/controller-action-request/controller-action-request.ts);
- [`module-runtime.ts`](../src/module/runtime/module-runtime/module-runtime.ts).

## Revalidation Разделена Не До Конца

`RevalidateService` уже является router-neutral частью:

- регистрирует keyed и fallback handlers;
- принимает внешний `AbortSignal`;
- запускает handlers;
- сообщает runtime failures.

Однако application/module bridge использует `useRevalidator()` и ждёт перехода
RR revalidator в `idle`.

`RevalidateBridge` вызывает `useRevalidator()` безусловно, даже если ему передана
собственная функция `revalidate`. Поэтому module view нельзя отрисовать вне
React Router provider.

`ModuleRuntime.revalidate()` сохраняет loader URL и создаёт новый Web `Request`
для повторного controller load. Локальная операция обновления runtime тем самым
остаётся смоделирована как URL loader request.

См.:

- [`revalidate.service.ts`](../src/revalidate/runtime/revalidate-service/revalidate.service.ts);
- [`revalidate-bridge.tsx`](../src/revalidate/react/revalidate-bridge/revalidate-bridge.tsx);
- [`module-runtime.ts`](../src/module/runtime/module-runtime/module-runtime.ts).

## Pending И Fallback Основаны На RR Navigation

`RoutePendingBoundary` и `useRoutePending()` используют:

- `useNavigation()`;
- `useLocation()`;
- `useHref()`;
- current и next URL;
- сравнение path segments.

На этой основе framework решает:

- сохранить ли текущий контент;
- показать ли route fallback;
- считать ли ссылку pending;
- является ли операция navigation или revalidation.

Для FSM эти понятия могут выражаться через current snapshot, запрошенную
команду, pending snapshot и подтверждённый внешний snapshot. Поэтому общей
абстракцией должен стать transition state, а не оболочка над RR navigation.

См.:

- [`route-pending-boundary.tsx`](../src/react/router/pending/route-pending-boundary.tsx);
- [`use-route-pending.hook.ts`](../src/react/router/use-route-pending/use-route-pending.hook.ts).

## Errors И Policy Outcomes Исполняются Через RR Exceptions

Внешняя модель policy decisions близка к универсальной:

- continue;
- forbidden;
- not found;
- redirect;
- error.

Но `RouteRuntime` исполняет эти решения через:

- `throw redirect(...)`;
- `throw replace(...)`;
- `throw new Response(..., { status: 403 | 404 })`.

Error boundary затем получает ошибку через `useRouteError()`.

Это смешивает domain/framework decision с транспортным представлением React
Router. Policy runner должен возвращать framework outcome, а каждый adapter
должен самостоятельно переводить его в URL redirect, FSM transition, forbidden
view или exception boundary.

См.:

- [`router.ts`](../src/router/declaration/router/router.ts);
- [`route-runtime.ts`](../src/router/runtime/route-runtime/route-runtime.ts);
- [`route-exception-boundary.tsx`](../src/react/router/exception/route-exception-boundary.tsx).

## `Router` И `Route` Являются URL-Декларациями

Текущий `Router` содержит:

- `baseUrl`;
- URL route tree;
- redirects по строковому URL;
- saved location.

Текущий `Route` содержит:

- `path`;
- index route;
- nested path tree;
- `defaultTo`;
- `firstAvailable`;
- path validation.

Это корректная модель URL router, но не универсальная декларация runtime.

FSM router, вероятно, будет содержать screen/state pattern, snapshot selector,
command availability и внешний snapshot source. Добавление этих полей в текущий
`Route` создаст перегруженную абстракцию.

См.:

- [`router.ts`](../src/router/declaration/router/router.ts);
- [`route.ts`](../src/router/declaration/route/route.ts).

## Location И Navigation Уже Скрыты За DI, Но Остаются URL API

`LocationServiceInterface` и `NavigateServiceInterface` являются полезными
facade для URL feature code. Они скрывают конкретный React Router navigator, но
их контракт всё равно включает:

- pathname;
- search и search params;
- hash и hash params;
- history back;
- navigate/replace по строковому URL;
- route params;
- browser location state.

Эти сервисы не следует объявлять универсальным router contract. Их следует
сохранить как URL capability, которую предоставляет URL adapter.

В management panel найдено:

- 17 production-файлов с `LocationServiceInterface` или `useLocation`;
- 19 production-файлов с `NavigateServiceInterface`, `useNavigate` или
  `NavItem`;
- пять прямых использований RR `NavLink`, часть из которых использует
  `viewTransition`.

URL-зависимый feature code может оставаться URL-зависимым. Важно, чтобы эта
зависимость была явной capability, а не обязательным свойством всего framework.

## Frames Также Протекли URL-Моделью

`FrameSourceInterface` выглядит как абстракция, но его context напрямую содержит:

- `RouterLocationSnapshot`;
- `NavigateServiceInterface`;
- `RouterParamsConverterInterface`.

`HashFrameSource` открывает и закрывает frame через URL hash. `FrameService`
дополнительно:

- читает browser location;
- анализирует `hashParams`;
- хранит frame navigation stack с router scope;
- определяет доступность frame через active URL route branch;
- использует `globalThis.location` как fallback.

`HashFrameSource` является корректным URL adapter, но URL context не должен
определять общий frame source contract. Для FSM понадобится snapshot-backed
frame source или другой способ связать frame с текущим состоянием.

См.:

- [`frame-source.interface.ts`](../src/frame/source/frame-source/frame-source.interface.ts);
- [`hash-frame-source.ts`](../src/frame/source/hash-frame-source/hash-frame-source.ts);
- [`frame.service.ts`](../src/frame/service/frame-service/frame.service.ts);
- [`router-runtime.ts`](../src/router/runtime/router-runtime/router-runtime.ts).

## Несоответствие Документации Реальной Границе

Текущая документация утверждает, что feature code не работает напрямую с React
Router и что React Router находится внутри adapter. Это верно для большей части
feature imports, но не полностью верно архитектурно.

React Router concepts присутствуют в:

- публичных controller args;
- provider contexts;
- module action transport;
- revalidation lifecycle;
- pending semantics;
- error outcomes;
- commit активной route branch;
- frame availability.

Кроме того, текущая mental model изначально описывает Router как URL matching.
Следовательно, URL-centric не только реализация, но и часть концептуальной модели
framework.

См.:

- [`03-router-and-navigation.md`](./03-router-and-navigation.md);
- [`01-mental-model.md`](./01-mental-model.md);
- [`17-public-api-boundary.md`](./17-public-api-boundary.md).

## Независимое Ядро, Которое Можно Сохранить

Следующие части не требуют замены вместе с React Router:

- application lifecycle;
- DI и вложенные runtime scopes;
- binding modules;
- controller discovery;
- dynamic module loading;
- provider pipeline как последовательность фаз;
- runtime operation model;
- cancellation через явный `AbortSignal`;
- runtime failure capture/reporting;
- commit/discard/dispose semantics;
- loader data storage;
- layouts и UI exception components;
- widget runtime;
- большая часть frame runtime;
- registry-механизм `RevalidateService`.

Особенно полезны два существующих прецедента:

1. frame/widget actions уже вызываются напрямую через runtime без RR fetcher;
2. `RevalidateService` уже отделяет команду revalidate от механизма выполнения.

## Требуемая Граница Абстракции

Не следует создавать один mega-router с optional `pathname`, `snapshot`,
`request`, `params` и `screen`. Универсальным должен стать протокол активации
runtime, а конкретные navigation models должны оставаться раздельными.

### Runtime Declaration

Общие свойства активируемого узла:

- module loader;
- policies;
- providers;
- layouts;
- frames;
- fallback/error components;
- runtime identity.

Здесь не должно быть `path`, URL или FSM screen pattern.

### Adapter-Specific Router Definition

```text
UrlRouterDefinition
  path
  index
  baseUrl
  redirects
  history/location

FsmRouterDefinition
  state/screen pattern
  snapshot selector
  source
  transition/command mapping
```

Обе декларации должны ссылаться на общие runtime declarations.

### Runtime Activation Protocol

Универсальный runtime coordinator должен владеть:

- prepare;
- load;
- abort;
- commit;
- discard;
- dispose;
- active branch;
- transition state;
- revalidate;
- policy outcomes.

Возможная форма общего контекста:

```ts
interface RuntimeActivationContext<TInput = unknown> {
  readonly input: TInput;
  readonly signal: AbortSignal;
}
```

URL adapter может передавать `params`, location и navigation kind внутри своего
input. FSM adapter может передавать snapshot, screen и state. Web `Request` при
необходимости может оставаться URL capability, но не обязательной частью
controller contract.

### Adapter Capabilities

URL adapter может предоставлять:

- location;
- navigate;
- href;
- history;
- search/hash params;
- saved URL;
- browser view transitions.

FSM adapter может предоставлять:

- current snapshot;
- отправку command;
- available commands;
- external transition pending state;
- snapshot subscription.

Feature должен явно зависеть от нужной capability. Остальной framework не должен
знать о ней.

## Предварительная Последовательность Вытеснения

1. Зафиксировать characterization tests текущего RR-поведения.
2. Добавить router/runtime adapter в конфигурацию `Application`, сохранив React
   Router единственной реализацией.
3. Вынести RR-типы из `RouteRuntime`: собственный activation context, outcomes и
   явный `AbortSignal`.
4. Перевести module actions на прямой `ModuleRuntime.action()` по образцу
   frame/widget runtime.
5. Сделать module revalidate непосредственной операцией runtime; RR revalidate
   оставить механизмом URL adapter.
6. Разделить общий compiler runtime declarations и RR `RouteObject` builder.
7. Ввести router-neutral transition/pending state.
8. Оставить location/navigation/hash/saved-location как URL capabilities.
9. Очистить общий `FrameSourceContext`; оставить `HashFrameSource` URL-specific
   реализацией.
10. После стабилизации adapter contract реализовать FSM adapter.

Этот порядок является предварительным. Перед реализацией нужен отдельный design
с точными контрактами, ownership и migration stages.

## Обязательные Characterization Сценарии

Перед рефакторингом необходимо явно зафиксировать:

- ordering loaders, actions и revalidation;
- автоматическую revalidation после action;
- abort предыдущего loader при конкурирующей navigation;
- prepare/commit/discard при смене active branch;
- сохранение текущего UI во время same-route revalidation;
- same-URL navigation;
- search-only и hash-only navigation;
- `defaultTo` и `firstAvailable`;
- policy redirects и saved-location recovery;
- `replace` против history push;
- error bubbling до ближайшего boundary;
- nearest fallback и nested layouts;
- session logout -> invalidate routes -> revalidate;
- frame availability по active branch;
- hash frame open/close/back/reload;
- browser back и view transition behavior.

Существующие тесты уже покрывают значительную часть поведения, но смешивают
framework semantics с RR contract. В дальнейшем их следует разделить на:

- router-neutral runtime contract tests;
- React Router adapter conformance tests;
- FSM adapter conformance tests.

## Сопоставление С Текущим `app-fsm`

Текущий `app-fsm` работает от внешнего snapshot/source:

- подписывается на изменение snapshot;
- выбирает экран через `snapshot.screen`;
- сопоставляет screen с module tree;
- отправляет пользовательские команды во внешний controller/source.

Это подтверждает, что будущая общая абстракция не должна предполагать URL как
источник истины. URL router и FSM router имеют разные navigation state models, но
могут использовать единый lifecycle активируемых runtime entities.

## Финальный Вывод

React Router сейчас является основной частью внутренней работы `Application` и
module runtime. Текущий класс `Router` нельзя просто заменить другим router.

Абстрагировать требуется весь протокол выбора, подготовки, активации, обновления
и освобождения runtime entities. После этого:

- React Router станет одним adapter;
- URL location/navigation останутся его capabilities;
- FSM станет другим adapter с snapshot/command capabilities;
- modules, controllers, providers, layouts, widgets и frames смогут работать над
  общим runtime lifecycle.

Вытеснение возможно и поддерживается уже существующими частично нейтральными
механизмами framework. Однако это самостоятельная framework migration, а не
локальная доработка `Router`.
