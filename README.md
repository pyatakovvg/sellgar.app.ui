# `@sellgar/app`

- Статус пакета: development
- Статус реализации: in-progress

## Публичный API

Прикладные импорты ограничены entrypoint-ами из `package.json#exports`.
Они открывают declarations, сервисные контракты, hooks и компоненты подключения.
Widget runtime, screen renderer, resolved config и metadata registry доступны
только внутренним owners через их локальные facades.

`createNativeRouterBridge()` возвращает непрозрачную ссылку для
`ApplicationOptions.routerBridge`. Native Application разрешает её в единственный
bridge runtime; driver и завершение presentation остаются внутри адаптера.
Next Application предоставляет прикладной lifecycle и `getDependency()`,
а доступ renderer к scope, features и регистрации модулей остаётся внутренним.

Граница закреплена compile-time fixtures `contracts/public-api.fixture.ts` и
`contracts/next-facade.fixture.ts`. Они проверяют отсутствие внутренних экспортов
и отсутствие runtime access в публичных сигнатурах.

## Метаданные приложения и модулей

[Метаданные](core/metadata/README.md): `@Metadata` задаёт defaults,
`MetadataServiceInterface` предоставляет `set.*`, `get.*`, `reset.*` в scope
владельца. Заголовок документа компонуется из приложения, страницы и фреймов:
`Личный кабинет: Заказы (Настройка фильтров)`.

## Метрики приложения

[Подсистема метрик](core/application/metric/README.md) предоставляет классы событий
с `@MetricEvent`, общий `track(EventClass, data, { to })`, подключение адаптеров
через `app.metrics` и `useMetric()` для React/FSM/Native. Core валидирует данные,
маршрутизирует события и управляет очередями и lifecycle.
[Принятый RFC](docs/rfc/application-metrics.md) сохраняет историю решения.

## Контекст выполнения приложения

`RuntimeContextInterface` предоставляет участнику runtime `app`, framework-состояние
авторизации `session` и сигнал отмены `signal`. Публичный контракт `app` —
`ApplicationControllerInterface`: `lifecycle` и `subscribe()` относятся к lifecycle,
`location` и `subscribeLocation()` дают доступ к текущему корневому location.
Подписка на location не вызывает listener сразу и возвращает функцию отписки.

Данные принадлежат существующему application runtime; контекст не создаёт store
или второй источник состояния. До первого принятого location значение равно
`null`. Каждый принятый location содержит непрозрачный для core `state` от bridge
или навигации. Вложенный route scope может иметь собственный staged location,
но `context.app.location` всегда читает корневое состояние своего приложения.

Framework передаёт `RuntimeContextInterface` в `initialize(context)` и
`report(report, context)` обработчика `ApplicationReportHandlerInterface`.
Репортёр получает тот же объект приложения, что policies и initializers,
без внедрения приложения через DI. Сигнал контекста репортёра принадлежит
lifecycle приложения и отменяется при его освобождении. Отчёты cleanup продолжают
доставляться после отмены сигнала, пока обработчики не освобождены.

Контекст предоставляет доступ к актуальному состоянию при чтении. Это относится
и к ранним отчётам, доставляемым после инициализации обработчиков; контекст не
сохраняет исторический снимок для каждого сообщения. `ApplicationReport.context`
остаётся явно переданными данными конкретного отчёта. Framework не копирует
application state в отчёт и не отправляет его внешнему получателю автоматически.

## Проверка пакета

Инструменты разработки и тестирования предоставляет подключающая монорепа.
Для Next-адаптера закреплён TypeScript в `devDependencies`; типы React/React DOM
и окружение тестирования предоставляет подключающая монорепа.

`tsconfig.json` самодостаточен: не наследует конфигурацию приложения и не задаёт
путей к внешним `node_modules`. Зависимости разрешаются стандартным механизмом
TypeScript. Для полной проверки нужны peers и типы всех renderer-ов.
`tsconfig.core.json` наследует только локальную конфигурацию пакета.

Проверка типов охватывает публичные entrypoint-ы, их зависимости и перечисленные
compile-time fixtures. `include: []` исключает неявное включение всех тестовых
файлов; их globals и окружение настраивает запускающий тесты проект.

После установки workspace dependencies:

```sh
yarn workspace @sellgar/app typecheck:core
yarn workspace @sellgar/app typecheck
yarn workspace @sellgar/app typecheck:next
yarn workspace @sellgar/app test:next
```

Для `typecheck:next` в окружении разработки также нужен optional peer `next`.

Тестовое окружение проекта запускает core в Node, Web и общие React bindings
в jsdom, JS-контракты Native — с локальными подменами нативного UI.
Tests расположены рядом с владельцами. Общая настройка окружения находится
в `contracts/test-environment`; она не подменяет framework runtime.
Native JS-тесты не доказывают корректность жестов, клавиатуры, анимаций или
индикаторов на Android/iOS: эти проверки выполняются отдельно на устройствах.

`@sellgar/app` — renderer-agnostic реализация application runtime и единый
источник framework-контракта для приложений Sellgar.

Пакет организован как набор корневых entrypoint-каталогов без общего `src`:

- `core/` → `@sellgar/app`;
- `react/` → `@sellgar/app/react`;
- `native/` → `@sellgar/app/native`;
- `fsm/` → `@sellgar/app/fsm`;
- `next/` → `@sellgar/app/next` — адаптер Next.js App Router.

`shared/` содержит внутренние общие React bindings двух renderers, но не является
публичным entrypoint. Контексты renderer-ов остаются раздельными; core не зависит
ни от React, ни от этого shared-слоя.

FSM entrypoint использует общий core и React rendering, но не экспортирует
browser navigation API. Его `Application` получает `RouterBridge`, а `Router`
и `Route` разрешают адрес из snapshot в lazy Module. Источник snapshots передаётся
через `FsmSnapshotSourceInterface`; конкретный transport, валидация snapshot и
его state/command модели принадлежат приложению. Контракт описан в
[FSM Application и Router RFC](docs/rfc/fsm-application-and-router.md).
Текущий контракт деклараций `@Command`, `@Payload`, типизации аргументов и
transport resolution описан в [CommandsService](fsm/service/commands-service/README.md).

Native entrypoint повторяет публичные framework-понятия React facade:
`Application`, configurator, `Module`, `Layout`, `Widget`, renderer features,
guards/reactive bridges, `Route`, `Router`, `Shell`, navigation controls и
controller/revalidation hooks. Оба adapter-а используют один core lifecycle и
одинаковый bootstrap flow; различаются только renderer-specific presentation и
router bridge. Android consumer находится в отдельном repository
`sellgar.mobile.shop`, package `clients/mobile`. Native stack
projection использует хронологические core history entries и общие activation
runtimes, а физические переходы выполняет `ScreenRenderer` через
`ScreenRuntime/ScreenMachine` и Reanimated. Новый screen показывает локальный
fallback после принятия навигации. Возврат к подготовленному retained screen
с теми же параметрами показывает сохранённые данные без обязательного запуска
loader. Явное обновление и изменение query остаются отдельной ревалидацией. Back во время
`preparing` отменяет transition и мгновенно возвращает committed presentation.
Query не меняет identity screen; Route path и params меняют её.

Native deep links могут использовать те же запросы по Route token, что и
`NavItem`/`NavLink`. Стандартный Linking transport принимает `resolve(url)`:
приложение сопоставляет URL с целью, а framework выполняет весь переход,
включая policies, blockers, сохранение цели перед входом и core history.

```ts
const routerBridge = createNativeRouterBridge({
  transport: createNativeLinkingTransport({
    resolve: (url) => {
      if (url === 'https://example.com/wallets/wallet/top-up/bankcard') {
        return (navigate) =>
          navigate.to(DashboardRoute, {
            state: { open: 'top-up-bank-card' },
          });
      }

      return null;
    },
  }),
});
```

`DashboardRoute` может оставаться index Route без собственного адреса: запрос
содержит token и не превращается в выбор доступной корневой ветки. Начальная
ссылка и последующие OS URL events используют один обработчик. `to()` по
умолчанию добавляет позицию при переходе на другую activation;
`to(..., { replace: true })` заменяет текущую, а `resetTo()` сбрасывает историю.
`through`, params, query, state и revalidation сохраняют обычную типизацию и
семантику навигации. Запрос от bridge поступает в core с `source: 'external'`.

Resolver также может вернуть адресный `RouterBridgeLocationInterface` или
`null`. `null` игнорирует входящее событие; при старте без принятой ссылки
framework открывает обычный корень. Без `resolve` сохраняется стандартное
декодирование URL с учётом `prefixes`. Существующие адресные реализации
`NativeRouterTransportInterface` совместимы; transport с запросами может явно
использовать `NativeRouterTransportInterface<NavigationRequestFactory>` или
`NativeRouterTransportInterface<NativeRouterTransportTarget>` для обоих видов
целей. Его `getInitialLocation()` и `subscribe()` возвращают одну и ту же модель
цели. Runtime и логическая история остаются во владении core.

`navigate.resetTo(Token, options)` начинает новую логическую историю с одной
позицией целевого Route. Target может принадлежать любому Router, включая
вложенный; params, query, state, revalidation и `through(...).resetTo(...)`
разрешаются так же, как у `to()`. `replace` в options отсутствует: `to(...,
{ replace: true })` заменяет только текущую позицию, а `resetTo()` удаляет все
прежние. Policies, blockers и exception boundaries сохраняют обычный контракт
перехода. Отмена до commit сохраняет прежнюю историю; после commit Native bridge
получает `reset`, а удалённые activations освобождаются после presentation
completion. Retained runtime цели и общие ancestors могут переиспользоваться.
`NavItem`/`NavLink` также принимают factory `navigate => navigate.resetTo(Token)`.
В браузере reset очищает core history и заменяет текущий URL; History API не
позволяет удалить предыдущие физические записи браузера.

При построении native screen projection retained activations один раз группируются
по полной ancestry Route/params: вложенный outlet не сканирует всю историю заново.
Индекс существует только на время проекции и не заменяет core history/retention.
Вложенные index buckets создаются только для Route с дочерними маршрутами:
конечный Route не владеет outlet, а Route с index screen сохраняет свой bucket.
`ScreenRenderer` определяет анимацию входящей сцены один раз на render владельца,
а не повторяет поиск для каждой retained scene. Progress и завершение перехода
по-прежнему принадлежат Reanimated и `ScreenRuntime`.
Native `Viewport` переиспользует разобранную структуру и данные коллекции при
неизменной ссылке на children; новые children по-прежнему разбираются полностью.

Все entrypoints принадлежат одному package и разрешаются полем `exports` в
[package.json](package.json). Внешняя среда renderer-ов объявлена optional peers;
внутренние библиотеки реактивности и error boundary входят в `dependencies`. Отдельный
`typecheck:core` компилирует только публичный core facade без ambient React
types. Compile-time fixtures дополнительно фиксируют React facade, отсутствие
compatibility aliases, exact params для `to()`/`through()` и React navigation
controls. Реализация начата с renderer-independent route graph,
structured address и navigation resolution. В `core` находятся базовые DI
contracts/scope, session state, application store,
initializers, application feature activation, runtime failure flow, disposable
registry и единый Application lifecycle.

## Структурное содержимое Layout (React и Native)

`LayoutViewProps.kind` описывает непосредственную логическую границу внутри
лейаута: `'layout'`, `'module'` или `null`, если выбранной границы пока нет.
Framework определяет её по декларациям выбранной ветки маршрутов и передаёт
вместе с `children`. DOM, тип React-элемента и внутренние layouts модуля для
этого не исследуются. Router/Route hosts прозрачны для определения границы.

```tsx
const LayoutView: React.FC<LayoutViewProps> = ({ children, kind }) => (
  <main data-content-kind={kind ?? 'empty'}>{children}</main>
);
```

- `Layout → Layout → Module`: внешний получает `layout`, внутренний — `module`.
- `Layout → Module → собственный Layout → View`: внешний получает `module`.
  Собственный layout модуля тоже получает `module` для его view.
- Несколько собственных layouts модуля образуют отдельную цепочку: промежуточные
  получают `layout`, последний — `module`. За границу Module эта цепочка не выходит.
- Загрузка, локальная ошибка, action и revalidate не меняют принадлежность
  выбранного Module. При замене ветки сохранённый префикс не получает сведения
  о layouts ещё не показанной ветки; незаполненный outlet имеет `kind: null`.

Это метаданные композиции, не новое runtime-состояние или подписка. Layout keys,
scopes, providers и error boundaries сохраняются. Изменение `kind` само по себе
не перемонтирует layout. При этом изменение пользователем формы JSX вокруг
`children` может перемонтировать потомков по обычным правилам React.

Layout view может быть компонентом или объявленным React-элементом: в обоих
случаях renderer передаёт `children` и `kind`; остальные props, key и ref элемента
сохраняются. Произвольные элементы внутри `children` renderer не изменяет.

## Владение зависимостями

- `inversify`, `mobx`, `mobx-react` и `react-error-boundary` —
  внутренние зависимости фреймворка. Приложению не нужно объявлять их только
  ради использования фреймворка.
- `class-transformer`, `class-validator` и `reflect-metadata` — обязательные
  peers: приложение объявляет декорированные модели, фреймворк обрабатывает их.
  Host подключает `reflect-metadata` до выполнения декораторов.
- React, React DOM, React Native и используемые нативные библиотеки предоставляет
  host выбранного renderer-а. Optional peer означает возможность не устанавливать
  библиотеку неиспользуемого renderer-а, а не возможность запускать его без неё.
- `@floating-ui/react` остаётся optional web peer: его собственный контракт
  требует React DOM. Он не устанавливается автоматически для native consumer.
- `classnames` предоставляет web-приложение как peer dependency. Для core/native
  он не требуется и поэтому отмечен optional.
- Reanimated `4.7.x` и Worklets `0.13.x` образуют согласованную native-связку;
  обновлять их нужно с учётом совместимости с React Native.

Пакет, непосредственно подключающий `@sellgar/app`, объявляет необходимые peers
в своём manifest. Наличие зависимости только в соседнем workspace не заменяет
этот контракт. Внутренние библиотеки по-прежнему предъявляют собственные требования
к React; отсутствие runtime-импорта React в core не означает, что дерево установки
всего объединённого пакета полностью свободно от renderer-зависимостей.

## Провайдеры приложения

`app.providers([StartupProvider])` подключает обычные `@Provider()` к владельцу
Application. API наследуется React/Native/FSM и доступен в Next configurator.
Порядок старта: initializers → application providers (`initialize`, `prepare`,
`activate`, commit) → features → router bridge → ready. Все hooks ожидаются;
пока провайдер или его preload не завершён, приложение остаётся initializing.

```ts
@Provider()
class StartupProvider implements ProviderInterface {
  constructor(
    @Inject(WidgetPreloaderInterface) private readonly widgets: WidgetPreloaderInterface,
  ) {}

  prepare(context: ProviderPrepareContextInterface) {
    return this.widgets.preload(context, GlobalWidget);
  }

  dispose(): void {}
}

// В configure приложения:
app.providers([StartupProvider]);
```

Контекст prepare связан с application scope, props и params пусты. Используется
существующий WidgetPreloader; preload удерживает lease до освобождения провайдера.
Host переиспользует виджет при совпадении owner scope, token и runtimeKey.
Обычный host внутри module scope по-прежнему имеет отдельную identity: этот API
не экспортирует приватные widget bindings и не меняет выбор владельца host.

Навигация не перезапускает провайдеры приложения. `lifetime: 'application'`
сохраняет прежние ограничения hooks и совместное использование между pipelines;
для prepare/preload достаточно обычного `@Provider()` на уровне приложения.

Отказ hooks или последующего feature/router startup освобождает pipeline до
отклонения initialize. При dispose сначала отменяется startup signal, затем
останавливаются страницы и провайдеры приложения, после них освобождаются registry
виджетов, features и DI. Cleanup выполняется один раз, включая поздний результат
прерванной подготовки. Ошибки provider имеют application owner в reporting.
В Next server application остаётся request-scoped, browser application — общим
для вкладки; browser-only работу провайдер определяет в своих hooks.

## Подготовленное состояние Next

Next `app.states([StateAdapter])` регистрирует request-scoped адаптеры
`ApplicationStateInterface<T>`. Токен задаёт уникальный `key` и
`deserialize(unknown)`, экземпляр — `getSnapshot`, `subscribe`, `serialize` и
`hydrate`. Сериализация должна возвращать только разрешённые публичные данные;
request headers, cookie, credentials и экземпляры сервисов в неё не включаются.

Серверный ApplicationHost ожидает ready, получает сериализованные состояния и
передаёт их клиентскому host вместе с SSR-деревом. Browser runtime восстанавливает
все зарегистрированные состояния до initializers и providers. Провайдер может
использовать восстановленные данные без повторной загрузки. Отсутствующий или
невалидный снимок отклоняет startup; скрытой подмены пустым состоянием нет.

`useApplicationState(StateAdapter)` отдаёт подготовленный снимок при SSR и
гидратации, затем подписывается на живое состояние приложения. Команды из ещё
гидратирующегося интерфейса могут ожидать `useReadyApplication()` и получить
общий сервис из готового приложения. Next сохраняет SSR-интерфейс видимым без
splash и без клиентской подмены подготовленных контролов.

Фабрика приложения получает необязательный `ApplicationFactoryContext` с
server request headers или browser snapshot. Эти значения принадлежат отдельному
запуску; mutable global request context не используется.

## Application runtime

Core `Application` остаётся внутренней реализацией. React entrypoint уже
предоставляет renderer facade с публичным именем `Application`, типизированным
`ApplicationConfiguratorInterface` и `createView()`, как требует RFC. Facade
создаёт React config и module export resolver, но переиспользует единственный
core lifecycle и `RouterRuntime`. Application host подписывается через
`useSyncExternalStore`, отображает splash/application failure, Router-owned
`forbidden`/`not-found`/`exception`, application layouts и Module presentation
корневой Route-ветки. Конфигурация `routing()` хранит React presentation
contract вложенных Router. Вложенный Router проецируется через локальный
`Router.shell` либо default `app.routing({ shell })`; renderer-декларация
называется `@Shell`. Core регистрирует
renderer-neutral application features и активирует их bindings в общем
ApplicationScope. Он также создаёт один корневой `RouterRuntime` с переданным
renderer-specific resolver, связывает единый `NavigateServiceInterface` с
ApplicationScope и выполняет navigation transaction в порядке
`prepare -> bridge commit -> runtime commit | discard`. Policy redirects,
одноразовая saved location, `navigate.root()`, terminal forbidden/not-found,
supersede и bridge failure проходят тот же core pipeline. Для renderer adapter
Application публикует immutable navigation snapshot и уведомляет о смене
committed location или terminal decision; adapter не создаёт собственный
navigation state. Первыми встроенными feature-срезами перенесены navigation
blocker, notification и user request. Для blocker conditions, Route boundaries, scoped
`allow()` и pending decision принадлежат core, а renderer entrypoints
предоставляют presentation registry, hook и application layer. Для notification
core владеет общей application-scoped очередью, semantic status, таймерами,
pause/resume, handles и cleanup; React entrypoint добавляет восемь web placements,
typed renderable payload, presentation и hook. Единый React `OverlayHost`
автоматически создаёт в `body` стабильные frame, modal и notification layers,
располагает их после application root именно в этом порядке и удерживает
вложенные renderer portals внутри выбранного уровня. Прикладной код не
настраивает selectors, portal anchors или `z-index`; notification presentation
всегда отображается в последнем слое. User request сохраняет application-scoped
FIFO очередь и awaitable результаты `alert`, `confirm` и `prompt`; React adapter
владеет renderable payload, presentation registry, hook и modal layer. Все три
feature используют единственный core runtime и не зависят от Route transitions.
Web bridge отдельно владеет
Navigation API pre-commit, history fallback и `beforeunload`.
ApplicationScope также владеет единым
RequestExecutor: он сохраняет очереди, scoped cancellation и session recovery
текущего framework, а Application отменяет оставшиеся запросы при dispose.
После подтверждения перехода на другую страницу, включая history back/forward,
текущие запросы executor отменяются до загрузки новой страницы. Отмена освобождает
последовательную очередь сразу; поздний ответ не публикуется.
Отмена принятого перехода через Back или замену другим переходом также отменяет
запросы загружаемой страницы. Обычная замена query сохраняет правило занятого loader.
Сигнал lifecycle распространяется от Route/Module на вложенные виджеты. Retain прекращает их
загрузки, а focus позволяет последующие запросы и возобновляет отменённую первую
загрузку виджета. При отмене сбрасывается `inProcess`; состояние коллекции
сохраняется по последнему принятому результату.
Защищённый `401` полностью поглощается этим application boundary: конкурентные
ошибки объединяются в одну recovery operation, notifier выполняется до перехода
в `anonymous`, а `SessionRuntimeState.expire()` активно завершает зависшие
runtime operations без передачи исходной ошибки контроллеру. Обычные
`setAuthenticated()`/`setAnonymous()` остаются управляемыми переходами: action
входа или выхода физически завершается, но его stale result не публикуется.
Если защищённый запрос истекает до первого commit, Application отменяет pending
navigation и повторяет её через session boundary с полной проверкой политик.
Защищённая ветка не коммитится, а исходная navigation сохраняется для возврата
после входа, если это предусмотрено policy redirect.
При запуске на `/` единственная явно заданная index-ветка проходит обычный
policy pipeline: её `onFail` redirect выполняется. Это сохраняет переход на
вход после начального `401` профиля. Если один корневой адрес объявлен у
нескольких index-веток, сначала проверяется их `canMatch` без failure handlers
отклонённых кандидатов. Поэтому anonymous onboarding может уступить адрес
authenticated dashboard после `setAuthenticated()`, не зацикливая
`redirectToSaved()` на корне. `Router.firstAvailable()` также сохраняет
проверку доступности кандидатов.
Renderer-independent `ApplicationEventBusInterface` также является singleton
того же ApplicationScope: Module, Route и Widget runtimes обмениваются
типизированными событиями без зависимости от renderer adapter. `publish()`
ожидает async handlers, но изолирует ошибку отдельного подписчика через общий
runtime failure flow. `createScope()` группирует подписки конкретного владельца,
а application dispose очищает оставшиеся регистрации. Повторные регистрации
одного handler доставляют событие один раз; снятие одной регистрации не
отключает остальные scopes, пока не освобождён последний владелец.
Renderer-neutral reactive entity layer сохраняет `@Entity`,
`@EntityCollection`, weak registries и атомарные `updateEntity`, `insertEntity`
и `removeEntity`: доменные classes не импортируют MobX и обновляют все живые
instances/collections по identity. React adapter отдельно экспортирует
прозрачные bridges `Reactive` и `reactive`; они не создают DOM, runtime owner
или второй lifecycle.

`useBlocker()` в React и Native adapters принимает необязательные синхронные
`onLeave` и `onStay`. Core вызывает выбранный callback каждой registration,
которая фактически заблокировала переход. Callback выполняется до разрешения
ожидающего решения и не отменяет выбор пользователя; нативный `beforeunload`
эти callbacks не вызывает.
ApplicationScope владеет общим ProviderScope: runtime providers получают
отдельные instances для каждого owner pipeline, а providers с
`lifetime: 'application'` разделяют instance, `initialize` и reference-counted
`activate` между leases. Один `@Provider(options?)` и один контракт
`ProviderInterface` используются для обоих lifetime; `dispose` обязателен,
а runtime-only `prepare` и `revalidate` запрещены для application lifetime.
Core также содержит renderer-neutral основу ModuleRuntime: lazy export
сначала проходит adapter-owned compatibility resolver, затем создаются
ModuleScope, controllers и provider pipeline; pending runtime явно commit-ится
либо освобождается. React entrypoint предоставляет `@Module`, `@Layout`,
`@Shell` и `RenderableView`; внутренний React resolver
принимает ровно один совместимый lazy export и переносит его module/layout
bindings и providers в core definition до запуска прикладного runtime-кода.
Initial load выполняет provider `initialize`, затем provider `prepare` и guarded
controller loaders в одной concurrent operation, после чего `activate` и commit
атомарно публикуют loader data. Renderer не участвует в provider lifecycle:
React render и StrictMode replay не запускают hooks. Dispose прерывает operation,
ждёт её физического завершения, выполняет retained cleanup и обязательный
provider `dispose`. Ошибка lifecycle или render его view/layouts переводит
только ModuleRuntime в `failed`; React boundary передаёт render failure core
runtime и освобождает его controllers/providers.
При показе уже разрешённого `forbidden` или `notFound` React и Native adapters
не выводят рядом Exception виджета в окружающем layout для того же HTTP-статуса
403 или 404. Виджет сохраняет своё runtime-состояние и обычный lifecycle;
меняется только его presentation. Цепочка поиска компонентов не меняется:
если специализированный компонент не выбран, Exception виджета остаётся
доступным. Остальные ошибки не подавляются. Область этого правила ограничена
одной Router presentation; независимый frame получает собственную область,
а при восстановлении маршрута подавление дополнительного Exception снимается.

Module view получает свой ModuleScope и typed controller runtime через
React contexts; публичный adapter экспортирует reference hooks `useController`,
`useLoaderData`, `useSubmit`, `useParams`, `useRevalidate` и `useDependency`.
React guard adapter экспортирует `useGuard` и прозрачный `Guarded`: оба
выполняют renderer-neutral declarations через единый последовательный
`GuardRunner` в текущем runtime scope. Массив declarations сохраняет семантику
`AND/all`, отказ возвращает `false` либо показывает `fallback`, а ошибка guard
передаётся ближайшей React exception boundary.
Результат guard принадлежит конкретным scope, declarations и context.
При изменении входов до завершения новой проверки `useGuard` возвращает `false`;
запоздавший результат предыдущей проверки не разрешает новый контекст.
Callable handles `useSubmit` и `useRevalidate` являются снимками состояния:
изменение наблюдаемых данных создаёт новую ссылку, не изменяя ранее выданный
handle. Это позволяет передавать handle целиком memoized-компоненту.
Общий binding `useRevalidate` в React и Native сохраняет ссылку на выбранный
снимок, пока его `inProcess/error` не изменились. Изменение общей runtime revision
само по себе не вызывает рендер потребителя другого controller token.
Подписчики core по-прежнему получают уведомления runtime; binding исключает
только React render при неизменном выбранном состоянии, не меняя запуск loaders.
Controller actions выполняются на активном runtime через guards и общий
operation/failure flow; исходный payload передаётся без сериализации, а submit
state изолирован по controller token. Recoverable ошибка остаётся в submit
state, и только явная runtime escalation переводит ModuleRuntime в `failed`.
Локальный revalidate сохраняет ModuleScope,
controllers, providers и текущие loader data, параллельно выполняет guarded
loaders и явный provider `revalidate` без повтора `initialize`/`prepare`/`activate`
и без initial fallback. Global и targeted
operations имеют observable state. Пока controller выполняет loader, повторная
ревалидация этого controller не запускается; общий запуск блокируется, пока есть
любая незавершённая загрузка owner. Заблокированный вызов ожидает текущую
работу и не планирует повтор. Правило действует и при смене query/props:
после завершения нужен новый явный вызов. UI блокирует управляющие элементы
через loading. Разные targeted operations сохраняют существующую
последовательность loader transactions. Abort, session revision и dispose
по-прежнему запрещают публикацию late result.
`useRevalidate()` без token запускает общую revalidation owner и агрегирует
`inProcess/error` общей и любой targeted operation. `useRevalidate(Token)`
запускает targeted revalidation и наблюдает только operation, явно адресованную
этому token. Общая revalidation выполняет loaders всех controllers, но не
переводит keyed handles в `inProcess` и не публикует в них общую ошибку.
Произвольные методы controller вызываются через единый runtime invoker и
application operation coordinator: сохраняются исходные аргументы, `this`,
sync/async результат, controller attribution и одна refresh wave после изменения
session. Renderer adapter должен строить typed facade поверх `invoke`, а не
выдавать raw controller. `loader`, `action` и `dispose` через этот путь запрещены:
они остаются только в своих framework lifecycle, guards и observable state.
Core Widget реализован как отдельный runtime owner, а не разновидность Module.
`WidgetRuntimeRegistry` задаёт identity
`owner scope + widget token + (runtimeKey ?? default)`, выдаёт host/preload
leases и откладывает cleanup последнего lease на microtask, чтобы React
StrictMode replay не пересоздавал controller/provider instances. Одинаковая
identity разделяет runtime, loader data, submit/revalidate state и последнее
принятое значение props; разные keys и owner scopes изолированы. Каждая
load/action/revalidate operation захватывает собственный props snapshot,
прерванная revalidation не публикует late result. React entrypoint владеет
`@Widget`, `WidgetHost`, `useWidgetProps` и локальными fallback/exception,
включая render error boundary; core не импортирует presentation types.
В React, Native и FSM внутренний widget host мемоизирован по runtime/token:
сам по себе рендер внешнего host не запускает widget view повторно.
Изменение props принимается runtime; обновления самого runtime и renderer
contexts продолжают обновлять widget view независимо от мемоизации.
Core `RouteRuntime` создаёт отдельный RouteScope, владеет scoped params и
optional ModuleRuntime, route providers и поддерживает явный
`prepare -> commit | discard` переход. Routing-only Route активируется без
фиктивного модуля. React Route facade добавляет layouts, их bindings/providers и
локальные `fallback`/`exception`/`forbidden`/`notFound`, не протаскивая React в
core, и явно владеет типом renderer-specific module loader. Ошибка подготовки
остаётся pending до решения navigation pipeline, а
отмена, session invalidation и dispose не публикуют late result и ждут
физического завершения controller loader перед cleanup. Initial activation
инициализирует Route providers, параллельно готовит их и ModuleRuntime, затем
активирует и атомарно commit-ит обоих owners. Controller action и invoke
делегируются ModuleRuntime без второго operation coordinator. Локальный
revalidate сохраняет Route/Module instances и запускает только их явные
`revalidate` hooks вокруг Module revalidation.
Route-provider, Module-provider и controller loaders участвуют в одной
loader-транзакции ревалидации. Отказ любого участника отбрасывает подготовленные
накопления Collector, даже если другие участники уже завершились.
Core `RouterRuntime` собирает эти boundaries в иерархический logical state:
локальная Route-ветка каждого Router scope хранится отдельно от дочернего Router
и его owner Route. Это сохраняет основной screen при открытии nested routing,
включая Router на ancestor Route. Переход готовится транзакционно: resolve и
policies выполняются до parallel module preparation, предыдущая ветка остаётся
committed до явного commit, а discard/supersede освобождает только кандидата.
Committed Route-цепочка не подменяется candidate runtime до commit.
Application публикует `pending` после принятия перехода navigation pipeline,
а не синхронно при любом вызове `navigate.to()`: отклонённая blocker-ом попытка
не должна создавать target screen.
Web показывает fallback ближайшей изменяемой boundary committed-ветки.
Native может создать pending presentation screen/frame до commit и показать
fallback внутри целевого screen или shell; смена fallback на content не создаёт
новый screen и не перезапускает его анимацию. Frame располагается над layout.
Начальную подготовку приложения закрывает splash. Переход, меняющий только
дочерний Router, сохраняет owner Module. Завершение frame-анимации относится
к конкретной физической анимации, а подтверждение presentation — к её revision;
запоздавший callback не завершает другую операцию.
Native compositor разделяет активность слоя и передачу касаний: неактивный
предок пропускает касания к активному вложенному frame, но его собственная
сцена и жест закрытия shell остаются неактивными. Modal сохраняет приоритет
над frame. Подтверждение готовности сцены не зависит от того, какой слой
сейчас владеет взаимодействием.
Index/default/structural branches и `Router.firstAvailable()` разрешаются до
prepare; rejected probing candidate не запускает свой result handler.
Router declaration принимает core `providers`, а React facade добавляет к ним
providers и bindings его layouts. `RouterRuntime` сохраняет собственный
provider pipeline и подготавливает его в той же navigation transaction, что
и Route/Module candidates. Provider hooks запускает только core; Router host не
публикует render milestone. Локальные Router
policy/provider outcomes `forbidden`, `not-found` и `failed` commit-ятся как
состояние именно затронутого RouterRuntime. Вложенная boundary очищает только
его Route branch, поэтому owner Module остаётся активным внутри родительской
ветки. Route policy/provider outcomes commit-ятся в состояние точного
RouteRuntime: ancestor Route/Module/layouts остаются активными, а только
descendant branch удаляется. React Router host воспроизводит иерархию RouteHost,
поэтому layouts и ближайшие boundary-компоненты разрешаются на своём уровне.
Nested Router остаётся logical child своей owner RouteScope, но React adapter
отображает его через application-level `NestedRouterLayer`, а не в DOM subtree
RouteHost и не внутри application layouts корневой presentation. `@Shell`
implementation владеет визуальным chrome и interaction, а React host отображает
активный shell в frame layer общего `OverlayHost`. Modal и notification layers
всегда следуют за frame в DOM, поэтому межслойный порядок не зависит от локальных
`z-index`; routing configuration не хранит DOM selector, portal root или
`z-index`.
Core policy-слой сохраняет `@Policy`, typed configuration builder, result
handlers и последовательный reference runner. Router/Route declarations
владеют своими policy boundaries, а RouteRuntime выполняет одну boundary либо
проверяет `canMatch` в probing-режиме без handlers. RouterRuntime агрегирует
затронутые boundaries parent-to-child отдельными фазами `canMatch` и
`canActivate`, не перезапуская неизменившийся parent из-за дочернего перехода.
Controller action сохраняет reference-путь `useSubmit -> RouteRuntime ->
ModuleRuntime`: перед вызовом action core повторно проверяет `canMatch` Router и
Route owner path, затем `canAction` его Route boundaries. Policy redirect
запускает обычную Application navigation transaction; `forbidden`/`not-found`
отклоняют submit, не размонтируя уже активный Route.
RouteScope получает facade единого NavigateService с identity Router и
RouteRuntime. `navigate.query()` меняет query текущего Router scope; module query
ревалидирует только module Router, frame query — только frame Router, а
эквивалентное обновление ничего не запускает. `{ revalidate: false }`
ограничивается location/history commit. Core `LocationServiceInterface`
публикует scoped Route params и transient state. `RouteQueryServiceInterface`
публикует raw query через `query.current()` и явный cross-scope
`query.route(RouteToken)`; React предоставляет те же границы через
`useQuery()`/`useQuery(RouteToken)`. Browser URL primitives наружу не выходят.
Прикладной типизированный query объявляется отдельным `@Query()`-классом. Все
его поля автоматически входят в query schema без `@Expose()`, `?` и значений по
умолчанию. `query.get(QueryClass)` возвращает `QueryValue<QueryClass>`, который
автоматически выражает возможное отсутствие каждого поля. Validation и
`@Transform()` применяются только к присутствующим значениям. Один owner читает
свой срез через `query.get(QueryClass)`. Data controller может собрать общий
фильтр через `query.get(SearchQuery, FilterQuery, SortQuery)`; результат имеет
тип пересечения их `QueryValue`, а каждый класс независимо проходит conversion
и validation. Пересекающиеся ключи агрегируемых классов считаются ошибкой
конфигурации. `query.set(QueryClass, value)` полностью заменяет только один срез
с сохранением соседних, а `query.clear(QueryClass)` удаляет только принадлежащие
классу ключи.
Преобразование через `class-transformer`, validation и сериализация остаются
внутри core service.
Web bridge поддерживает повторяющиеся query keys, вложенные объекты и
индексированные массивы. При включённом `parseArrays` индекс массива должен
быть безопасным целым числом от 0 до 999; превышение вызывает `RangeError`
до выделения массива. При `parseArrays: false` ключи с квадратными скобками
сохраняются буквально. Ограничение индекса не меняет обработку повторяющихся
ключей и JSON-значений, размер которых определяется размером входа.
Terminal `navigate.to()` единолично задаёт navigation target и lifecycle.
`navigate.through()` только связывает params его строгих предков: для уже
committed внешней ветки nested Router binding является проверкой контекста и не
может изменить эту ветку либо запустить её fallback; несовпадение отклоняется до
execute. Для ещё неактивной ancestry те же bindings используются terminal
переходом при построении единой transaction.
Application navigation snapshot одновременно хранит committed и pending
logical state. Pending target публикуется сразу при начале transaction,
заменяется новым target при supersede или policy redirect и очищается после
commit, interruption либо failure. Core отдельно вычисляет состояние target:
active допускает продолжающуюся дочернюю Router-ветку, а pending требует точного
совпадения инициатора, Router scopes, Route params и query. Поэтому nested transition не
становится processing внешнего navigation control. Renderer adapter только
подписывается на готовое core-состояние; `useRouteActive` и `useRoutePending` не
задают собственных matching-правил. Для декларативного
управления `NavItem` передаёт произвольному control `execute` и active/pending,
а `NavLink` передаёт render delegate готовый объект `anchor` для голого `<a>`.
Оба собирают тот же типизированный
`navigation={(navigate) => navigate.through(...).to(...)` request, что и
imperative service; URL строит только href-capability web bridge, а renderer
transport в matching не участвует. Optional `viewTransition` оборачивает
исполнение того же request в browser View Transition API и прозрачно выполняет
обычную navigation, когда capability недоступна.
Application подключает к operation coordinator один session-refresh handler.
Волна повторяет `canMatch`/`canActivate` всей committed Router/Route-цепочки,
затем loaders и provider `revalidate` без initial lifecycle и без
пересоздания стабильных runtime instances. Повторные session changes
прерывают устаревший результат и планируют следующую сериализованную волну.
Policy redirect является синхронным token-based решением с точными локальными
params и не принимает transport path или обычные navigation options.
Полная сверка framework-механик с текущей production-композицией зафиксирована
в [management-panel-characterization.md](docs/management-panel-characterization.md).
Admin UI и Mobile Shop используют этот package через его публичные entrypoints.

Освобождение Application сохраняет порядок bridge, Router, widgets, features,
providers и application resources. Ошибка отдельного этапа проходит через
`cleanup.contained` и не останавливает остальные этапы. Синхронные и асинхронные
disposers обрабатываются одинаково. Конкурентные вызовы `dispose()` ожидают одно
освобождение; после завершения Application переходит в `disposed`.

## Навигация и ревалидация

Внутренний `NavigationOperation` сохраняет причину запуска, исходную цель и
redirect ancestry конкретного перехода. `RuntimeExecution` относится к одному
запуску loader в конкретном owner scope. Эти metadata не добавляют обязательных
аргументов контроллеру и не хранятся в глобальном mutable current context.

Новые Route/Module готовятся до commit. Сохранённые owners ревалидируются после
commit согласно выбранной branch/router/restore области. При смене локальной Route-цепочки
postcommit обновляет только сохранённые owners с изменившимся query; уже
подготовленные Route не загружаются повторно. Открытие дочернего Router с прежним
query не запускает загрузчики родителя. `revalidate: false` пропускает эту фазу.

При явной навигации `target`, `root` или `bridge-request` новая выборка Collector
начинается только у конечной цели, если её owner выбран для ревалидации.
Предки и независимые Widget owners не получают скрытого сброса. Ошибка обновления
сохраняет принятые loader data; поздний результат старой выборки не публикуется.

## Накопление результатов loader

[Collector](core/collection/runtime/collector/README.md) выполняет переданный
callback, накапливает массив и предоставляет отдельный типизированный
`state.get/set` для значений потребителя. Он не интерпретирует контракты
ответов и пагинацию. `reset()` подготавливает новую коллекцию, сохраняя
прежние данные до успешной замены; injection в runtime связывает фиксацию
накоплений с принятием loader data.

## Архитектурные решения

- [Универсальное ядро, renderers и router bridge](docs/rfc/universal-core-renderers-router-bridge.md) — accepted, in-progress; целевая архитектура и оставшиеся границы переноса.
- [FSM Application и Router](docs/rfc/fsm-application-and-router.md) — accepted, partial; основа FSM-среза реализована, документ сохраняет границы решения.
- [Операции навигации и ревалидация](docs/rfc/navigation-operation-revalidation.md) — accepted, partial; контекст, планирование и Collector реализованы, оценка общего executor остаётся отдельным этапом.
