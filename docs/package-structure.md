# Структура `@sellgar/app`

- Статус документа: target
- Статус реализации: in-progress

Семантика framework зафиксирована в accepted
[RFC](rfc/universal-core-renderers-router-bridge.md). Здесь
описана только физическая граница package entrypoints.

```text
sellgar.app.ui/
  package.json
  tsconfig.json
  core/
    index.ts
    application/
      config/
        application-config/
        application-configurator/
      feature/
        application-feature/
      disposable/
        disposable-registry/
      initializer/
        application-initializer/
        application-initializer-group/
        initializer/
      lifecycle/
        application/
        application-lifecycle/
      reporting/
        console-runtime-failure-sink/
        runtime-failure-reporter/
      request/
        request-executor/
      session/
        session-expiration-notifier/
        session-runtime-state/
      store/
        application-store/
    controller/
      contract/
        controller/
      data/
        controller-loader-data/
      runtime/
        controller-method-invoker/
    di/
      binding/
        binding-builder/
        binding-module/
        binding-registry/
      composition/
        use-bindings/
      injection/
        decorators/
      inversify/
        inversify-binding-registry/
      token/
        dependency-token/
    http/
      exception/
        http-exception/
        transport-error/
    guard/
      contract/
        guard/
        guard-failure-strategy/
        guard-rejected-exception/
        guard-result/
      declaration/
        guard-declaration/
        guard-descriptor/
        guard-descriptor-builder/
        use-guards/
      runtime/
        guard-method-executor/
        guard-runner/
    module/
      contract/
        module-runtime-definition/
      resolution/
        module-export-resolver/
      runtime/
        loaded-module-runtime/
        module-runtime/
    policy/
      contract/
        policy/
        policy-boundary-decision/
        policy-result/
        policy-result-handler/
      declaration/
        policy-declaration/
        policy-descriptor/
        policy-descriptor-builder/
      runtime/
        policy-runner/
    revalidate/
      contract/
        revalidate-service/
      runtime/
        revalidate-service/
    reactive/
      entity/
        declaration/
          entity/
          entity-collection/
        operation/
          insert-entity/
          remove-entity/
          update-entity/
        runtime/
          entity-collection-observer/
          entity-collection-registry/
          entity-observer/
          entity-registry/
    router/
      bridge/
        router-bridge/
      declaration/
        address/
        route/
        route-token/
        router/
      params/
        class-transformer-router-params-converter/
        router-params-converter/
      runtime/
        navigation-state/
        route-policy/
        route-runtime/
        route-runtime-context/
        router-graph/
        router-runtime/
      service/
        location-service/
        navigate-service/
    runtime/
      context/
        runtime-context/
      exception/
        runtime-exception/
      failure/
        runtime-failure/
        runtime-failure-signal/
      operation/
        runtime-interruption/
        runtime-operation/
        runtime-operation-coordinator/
      provider/
        provider-metadata/
        provider-pipeline/
        provider-token/
        provider/
      scope/
        base/
          runtime-scope/
        kind/
          application-scope/
          module-scope/
          provider-scope/
          route-scope/
          router-scope/
          widget-scope/
    widget/
      declaration/
        widget/
      runtime/
        widget-runtime/
        widget-runtime-registry/
        widget-state-machine/
      service/
        widget-preloader/
  react/
    index.ts
    application/
      config/
        application-config/
        application-configurator/
      lifecycle/
        application/
      rendering/
        application-components-context/
        application-host/
    controller/
      hook/
        use-controller/
        use-loader-data/
        use-params/
        use-submit/
      runtime/
        controller-runtime-context/
    guard/
      hook/
        use-guard/
      rendering/
        guarded/
    layout/
      declaration/
        layout/
      rendering/
        layout-renderer/
    module/
      declaration/
        module/
      rendering/
        module-host/
      resolution/
        module-export-resolver/
    reactive/
      reactive/
      reactive-boundary/
    revalidate/
      hook/
        use-revalidate/
    router/
      declaration/
        route/
        router/
        shell/
      rendering/
        nested-router-layer/
        route-host/
        router-host/
          nested-router-host/
    runtime/
      exception/
        exception-context/
      scope/
        runtime-scope-context/
    view/
      renderable-view/
    widget/
      declaration/
        widget/
      hook/
        use-widget-props/
      rendering/
        widget-host/
      runtime/
        widget-runtime-context/
  native/
    index.ts
    application/
    controller/
    features/
    guard/
    layout/
    module/
    reactive/
    revalidate/
    router/
    runtime/
    view/
    widget/
  fsm/
    index.ts
```

Это части одного package, а не отдельные workspaces. Общего `src` нет. Корень
entrypoint содержит только facade. Реализация группируется по framework-домену,
роли и конкретному owner; owner предоставляет локальный `index.ts`.
Потребители owner импортируют его через каталог и не указывают `index.ts`
напрямую. Прямой путь к implementation-файлу допустим только внутри самого
owner; public entrypoint также собирает контракт через owner-каталоги.

Каждый последний каталог в дереве — concrete owner с implementation-файлами и
локальным `index.ts`. `core/application` владеет одним lifecycle, DI scope,
application features, session, initializers, failure flow и cleanup. Feature
bindings активируются в ApplicationScope один раз при compose и живут до
dispose; renderer presentation в core не входит. Initializers завершаются до
router bootstrap; bridge не подменяет application initialization.

`RequestExecutor` также принадлежит ApplicationScope: все дочерние runtime
scopes получают один executor, session recovery и набор очередей. Application
отменяет его активные и ожидающие задачи до cleanup остальных application
resources.

`ProviderScope` является отдельной application-owned DI-веткой. Каждый
`ProviderPipeline` получает собственные runtime provider instances и удерживает их
binding modules по refcount. Provider с `lifetime: 'application'` имеет один
application instance: `initialize` выполняется однажды, а `activate` удерживается
по reference-counted leases. Один `@Provider(options?)` и один
`ProviderInterface` покрывают оба lifetime; `dispose` обязателен, а application
provider не может объявлять runtime-only hooks `prepare` и `revalidate`.
Pipeline выполняет `initialize -> prepare -> activate -> commit`, хранит
возвращённые cleanup и запускает `revalidate` только по явной core-operation.
Renderer и render commit в provider lifecycle не участвуют.

`core/module` не объявляет публичный decorator. Renderer adapter проверяет
собственный lazy export и передаёт в core `ModuleRuntimeDefinition` с opaque
presentation, module token, ordered binding owners и provider tokens. Только
после успешной compatibility resolution core создаёт `ModuleScope`, controllers
и provider pipeline. `ModuleRuntime` сохраняет один in-flight import, pending
commit/discard и child-to-parent cleanup. Initial load coalesce-ит конкурентные
вызовы: сначала provider `initialize`, затем guarded loaders и provider `prepare`
параллельно, после чего provider `activate` и module commit атомарно
публикуют loader data. React host не участвует в lifecycle; operation identity,
abort и ожидание перед cleanup принадлежат core ModuleRuntime. Action использует существующий
controller instance и его guards, передаёт payload по ссылке и хранит независимый
observable state на controller token; второй action того же token не запускается.
Обычная ошибка остаётся recoverable action error, а
`RuntimeExceptionServiceInterface.raise()` явно переводит ModuleRuntime в
`failed`. Action не запускает implicit revalidate и не добавляет несуществующих
provider phases.

`react/module` владеет единственной React-реализацией `@Module`; compatibility
alias `Frame` отсутствует. `react/layout` владеет React-реализацией `@Layout`. Их metadata
сохраняет reference-поля `view`, `fallback`, `exception`, `layouts` и
`providers`, не добавляя `bindings`: binding modules по-прежнему подключаются
core-декоратором `@UseBindings`. Внутренний `ReactModuleExportResolver` принимает
ровно один React `@Module` из lazy package и до создания `ModuleScope`
преобразует его в `ModuleRuntimeDefinition`: module token остаётся владельцем
собственных bindings, Layout tokens становятся ordered binding owners, а module
и layout providers собираются в reference-порядке. Metadata другого renderer не
распознаётся как React Module. Активный view оборачивается в ModuleScope и
controller runtime contexts. Публичные `useController`, `useLoaderData`,
`useSubmit`, `useParams`, `useRevalidate` и `useDependency` сохраняют reference
API, но делегируют invoke, actions и revalidate напрямую core RouteRuntime без
React Router bridge и без второго lifecycle.

`core/widget` владеет `WidgetRuntime`, `WidgetScope`, controllers, provider
pipeline, action/revalidate state и registry runtime identity. Registry
объединяет только одинаковые `owner scope + token + runtimeKey`, удерживает
runtime host/preload leases и освобождает его после последнего lease либо
dispose owner scope. Props принимаются registry/runtime в порядке update, а
каждая уже начатая operation использует захваченный snapshot. React adapter
владеет `@Widget`, presentation metadata, `WidgetHost`, локальным
fallback/exception и `useWidgetProps`; renderer render не создаёт runtime и не
обновляет props как side effect render-фазы.

`core/revalidate` сохраняет единый публичный `RevalidateServiceInterface` и
runtime-local adapter. Ближайший `ModuleScope` связывает service с собственным
`ModuleRuntime`, поэтому feature-код не обращается к renderer bridge. Global
revalidation заменяет весь loader-data snapshot, targeted — объединяет patch по
controller token. Обе сохраняют runtime instances и текущую presentation,
параллельно выполняют guarded loaders и явный provider `revalidate`, публикуют
`inProcess/error` и выполняются последовательной superseding queue. Abort,
session revision, замена runtime и dispose запрещают применение late result;
cleanup controller/provider ждёт физического завершения уже запущенного loader.
Tokenless handle `useRevalidate()` запускает общую operation и агрегирует её
state со state всех targeted operations. Keyed handle `useRevalidate(Token)`
запускает и наблюдает только exact-token operation: общая revalidation физически
выполняет loader этого controller, но не наследуется его keyed state.
Пустой объект `revalidate({})` однозначно считается options, а не DI token.
`inProcess/error` хранятся и агрегируются только core runtime; renderer hook
подписывается на готовый snapshot и не создаёт локальную processing session,
не дублирует error и не отменяет operation из-за собственного unmount.

`core/controller/runtime` владеет общим invoker произвольных controller methods.
`ModuleRuntime` разрешает controller instance и исполняет invoker внутри
application-owned `RuntimeOperationCoordinator`; `RouteRuntime` делегирует этот
вызов и не создаёт второй coordinator boundary. Lookup метода, сам вызов и async
rejection сохраняют owner/controller attribution. Обычная
ошибка возвращается вызывающему коду без разрушения runtime, а явный
`RuntimeExceptionServiceInterface.raise()` переводит активный ModuleRuntime в
`failed`. `loader`, `action` и `dispose` недоступны через общий invoker, чтобы
нельзя было обойти guards, action state и cleanup. Renderer adapter создаёт
typed controller facade, который делегирует методы в `ModuleRuntime.invoke`, и
никогда не передаёт raw controller прикладному view.

`core/router/runtime/route-runtime` — renderer-neutral owner одной Route
boundary. Он создаёт `RouteScope`, хранит только локальные params этой Route,
владеет Route providers, optional `ModuleRuntime` и выполняет явный
`prepare -> commit | discard`. До commit подготовленный module доступен adapter
как boundary/presentation candidate, но controller operations разрешаются
только после commit. Initial activation инициализирует Route providers,
параллельно готовит их и ModuleRuntime, затем активирует и commit-ит оба
owner. Локальный revalidate сохраняет RouteScope, ModuleScope, controllers и provider
instances и запускает Route provider `revalidate` вместе с Module revalidation.
Ошибка подготовки не уничтожает текущую
committed ветку: navigation owner явно commit-ит failed target либо discard-ит
его. Route без `load` проходит тот же activation lifecycle без фиктивного
ModuleRuntime, что сохраняет routing-only boundary из RFC.

`react/router/declaration/route` расширяет core Route только presentation
metadata: layouts и локальные `fallback`, `exception`, `forbidden`, `notFound`.
Его `RouteOptions` также явно владеет renderer-specific module loader; core
сохраняет только opaque exports, а совместимость React `@Module` проверяет
`ReactModuleExportResolver` до запуска прикладного runtime-кода.
Layout tokens активируются как binding owners RouteScope, а их providers
добавляются после явно объявленных Route providers в runtime composition.
`RouteHost` является функциональной presentation boundary: подписывается на
свой RouteRuntime, предоставляет RouteScope и оборачивает
контент layouts этой Route. React render error передаётся в
`RouteRuntime.failRender()` и не переводит соседнюю либо ancestor Route в
`failed`. При замене RouteRuntime его subtree remount-ится,
поэтому локальное React-состояние прежней Route не протекает в новую ветку.

`core/router/runtime/router-runtime` владеет logical transaction выбранного
Router graph. Navigation state хранится как иерархия Router scopes: в каждом
scope есть одна локальная Route-ветка и не более одного дочернего Router с явной
owner Route. Поэтому Router, объявленный на ancestor Route, создаётся именно под
её `RouteScope`, не заменяет продолжающуюся main-ветку того же scope и может
жить одновременно с её ModuleRuntime. Общий prefix RouteRuntime сохраняется.
Core resolver также единолично вычисляет `active/pending` navigation control:
active использует branch semantics, а pending — точный target с той же
identity инициатора, иерархией Router scopes, params и query. Renderer не интерпретирует logical
navigation state и выбирает только способ отображения готового результата.
Новая ветка сначала проходит resolve, `canMatch`, `canActivate` и module prepare,
после чего owner получает одноразовый `commit | discard`; до commit предыдущая
ветка остаётся committed. Supersede и abort освобождают только candidate graph.
Index, explicit `defaultTo`, structural Route и `Router.firstAvailable()`
разрешаются до prepare; probing `firstAvailable` не применяет result handlers
отвергнутого кандидата.

Router declaration владеет core `providers`; React Router facade добавляет
provider tokens и binding owners своих layouts в отдельную runtime composition,
не протаскивая layout types в core. `RouterRuntime` удерживает pipeline на весь
срок своего `RouterScope`. При изменении локальной ветки новые Router pipelines и
Modules готовятся в одной navigation transaction, а затем commit-ятся вместе.
React host не участвует в provider lifecycle, поэтому StrictMode replay не запускает
повторные hooks.

Router policy либо Router provider terminal outcome хранится в snapshot того
RouterRuntime, которому принадлежит boundary. При terminal outcome дочернего
Router ancestor plans завершают подготовку и commit, а Route branch самой
boundary очищается. Поэтому shell показывает локальные `forbidden`, `notFound`
или `exception`, но Module owner Route остаётся активным. Route policy либо
Route provider terminal outcome хранится в snapshot точного RouteRuntime.
Ancestor Route/Module/layouts остаются активными, descendant Route path и
принадлежащий ему nested Router освобождаются. Функциональный React Router host
рендерит committed Route path как вложенные `RouteHost`, разрешает ближайшие
presentation overrides, а committed nested Router передаёт отдельному
application-level frame layer с сохранением logical owner RouteScope.
Redirect не становится render state и продолжает обычную application navigation
transaction.

React render boundaries следуют core ownership: Module view/layouts сообщают
ошибку `ModuleRuntime`, Route layouts — `RouteRuntime`, Router layouts и shell —
`RouterRuntime`, application layouts/features — `Application`. Shell presentation
вызывается внутри дочернего React-компонента, поэтому синхронная ошибка
`shell.render()` также перехватывается Router boundary.

Route и Router declarations сохраняют `canMatch`/`canActivate`, Route также
сохраняет `canAction`. Общий `core/policy` переносит reference-контракты
`@Policy`, typed descriptor builder, result handlers и последовательный runner.
`RouteRuntime` выполняет policies только одной Route boundary и предоставляет
отдельный `testCanMatch()` для probing без handlers. `RouterRuntime` сначала
агрегирует `canMatch` parent-to-child по всему затронутому path, затем
`canActivate`, и только после этого начинает параллельный prepare новых modules.
Controller action идёт по reference-цепочке `useSubmit -> RouteRuntime ->
ModuleRuntime`. Перед ним корневой RouterRuntime собирает committed owner path
целевой Route, повторно выполняет его Router/Route `canMatch`, затем Route
`canAction` root-to-leaf. Параллельная ветка, которой target action не
принадлежит, в path не попадает. Redirect выполняется через обычную Application
navigation transaction и сохраняет saved-location semantics;
`forbidden`/`not-found` отклоняют submit без запуска controller action и без
размонтирования активной Route. Policy error получает `action.failed`
attribution.

Policy redirect уже использует целевой RFC-контракт: синхронное решение хранит
одиночный Route token и точные локальные params target. Строковые transport
адреса, continuation `key`/`fallback` и navigation options `query`, `state`,
`merge`, `revalidate` в него не входят. Core `Application` интерпретирует
redirect внутри той же navigation transaction, хранит не более одной saved
logical location и однократно consume-ит её для `redirectToSaved`. При
отсутствии saved location запускается root resolution; публичный
`navigate.root()` использует тот же pipeline и по умолчанию `replace: true`.

Core `Application` создаёт один корневой `RouterRuntime` после конфигурации route
graph и получает renderer-specific `ModuleExportResolver` как opaque core port.
Один `NavigateServiceInterface` регистрируется в `ApplicationScope`, поэтому
bridge, initializers, policies и дочерние runtime используют одну транзакцию.
Каждый `RouterScope` переопределяет этот token scoped facade того же core
service. Поэтому `navigate.close()` знает текущий Router без передачи owner
Route разработчиком. Close удаляет только текущий вложенный Router state, сохраняет main
ветку владельца и не включает revalidate родительского runtime.
Каждый `RouteScope` переопределяет тот же navigation token facade с внутренним
`runtimeId` инициатора. Эта metadata не меняет target и не является новой
публичной Route-сущностью. `navigate.query()` создаёт обычную transaction над
query текущего Router scope;
`merge: true`, `replace: false` и `revalidate: true` используются по умолчанию.
`null`, `undefined`, пустая строка и пустой массив удаляют query key. При
same-value update не создаёт transaction. После изменения query post-commit
revalidation запускается для локальной Route-ветки Router-owner: query модуля не
ревалидирует frame, query frame не ревалидирует модуль. Route/Module instances и
current presentation сохраняются. `{ revalidate: false }` ограничивает операцию
commit-ом logical location/history.

Порядок успешной операции фиксирован: `RouterRuntime.prepare` разрешает policies
и подготавливает target, bridge commit-ит уже нормализованную logical location,
prepared transition commit-ит core branch, Application публикует новый location,
после чего та же transition выполняет optional scoped revalidation. Bridge
failure, supersede и abort до commit выполняют discard и сохраняют прежнюю
committed branch; ошибка post-commit revalidation уже не откатывает
зафиксированный location. Terminal
`forbidden`/`not-found` commit-ят location и Router-owned boundary state;
nested Router освобождает только собственную Route branch, сохраняя ancestor
runtimes. Application
публикует для renderer adapter единый immutable navigation snapshot с committed
location и terminal decision; subscription срабатывает только после завершения
core transaction. Failed module preparation остаётся pending target и может
быть commit-нута для exception UI.

`core/router/service/location-service` хранит renderer-neutral snapshot
`params/state`. Query принадлежит `NavigationRouterState` и читается через
`RouteQueryServiceInterface`: `query.current()` возвращает raw локальный query,
`query.route(RouteToken)` — query Router scope, содержащего указанный route
token. Прикладной query-срез объявляется классом с `@Query()` без обязательных
`@Expose()`, `@IsOptional()`, `?` и значений по умолчанию. Поля declaration
описывают тип присутствующего значения, а `query.get(QueryClass)` возвращает
`QueryValue<QueryClass>` с автоматически optional полями, выполняя conversion,
field transforms и validation. Data controller агрегирует независимые срезы
через `query.get(SearchQuery, FilterQuery, SortQuery)` и получает типизированное
пересечение их `QueryValue` без общей дублирующей query declaration. Каждый
класс обрабатывается отдельно; пересечение объявленных keys является ошибкой
конфигурации. `query.set(QueryClass, value)` полностью заменяет только ключи
этого класса, а `query.clear(QueryClass)` удаляет их, сохраняя соседние
query-срезы.
Новый RouterRuntime получает
staged target query до policies/loaders. После commit каждый scope публикует
только собственный query. Browser adapter кодирует root query в search, а query
активного nested Router — после hash address: `/module?a=1#frame?a=4`.
Browser pathname, hash, raw search и `URLSearchParams` в core contract не входят.

Action, произвольный controller method и локальный revalidate RouteRuntime
делегирует ModuleRuntime. Application-owned coordinator остаётся внутри
ModuleRuntime и не оборачивается второй раз на Route boundary. Abort, session
revision, discard и dispose запрещают late publication; controller/provider
cleanup ждёт физического завершения уже запущенного module loader. Route
providers уже принадлежат этому owner. React facade добавляет layout bindings и
providers в runtime composition, не помещая renderer presentation в
RouteRuntime.

Core `Application` подключает к `RuntimeOperationCoordinator` ровно один
session-refresh handler и отключает его до dispose runtime graph. Волна повторно
выполняет committed `canMatch`/`canActivate`, loaders и provider `revalidate`; active
Route, Module, controller и provider instances
сохраняются. Если current branch уже закоммичена как terminal boundary,
Application повторно разрешает тот же logical target с `replace: true`, чтобы
изменение session могло восстановить ветку без новой history entry. Bridge не
запускает вторую policy/revalidation wave.

`core/guard` сохраняет renderer-neutral reference contracts `@Guard`,
`UseGuards`, descriptors, failure strategies и последовательный runner. React
adapter реализует `Guarded` и `useGuard` поверх этого runner в текущем runtime
scope; второй lifecycle или renderer-specific guard runtime не создаётся.

`core/router/bridge` — внутренний порт между Application и renderer adapter: он
останавливает внешние navigation events и отражает logical commit, но не владеет
core navigation state. Он не входит в публичный facade и не становится
прикладной зависимостью. Core `Application` не реэкспортируется. React
entrypoint экспортирует renderer-specific `Application`, configurator,
declarations и root Router host, который создаётся через `createView()`. Host
читает lifecycle, navigation decision и root Route/Module snapshots из
единственного core runtime; собственного navigation state у adapter нет.
`routing()` является единственной renderer-specific конфигурацией presentation
вложенных Router; compatibility method `frames()` отсутствует.
Renderer-specific `Router` расширяет core declaration только presentation-
полями и хранит их отдельно от core definition. Root host не применяет shell;
application layouts оборачивают только presentation root Router, а отдельный
application-level layer для committed child Router сохраняет Module владельца и проецирует дочерний
host через `Router.shell ?? app.routing().shell`, Router layouts и его
`RouterScope`. Декларация называется `@Shell`; отдельные `FrameRouter`,
`FrameRoute` и `FrameLayer` в v2 не создаются. `native` повторяет публичные
framework-понятия React facade: Application/configurator, declarations,
Widget, features/presentations, guards/reactive bridges, controller и router
hooks, navigation controls и hosts. Renderer-specific различия остаются внутри
presentation и native bridge; второй lifecycle или logical navigation state не
создаются. Android consumer в `sellgar.mobile.shop/clients/mobile` повторяет web composition
structure и проверяет loader, action, revalidation, Route params и bridge
history. Native Stack/Tabs projection использует renderer-neutral registry
runtime entries из core: новый target имеет фазу `preparing`, текущий committed
runtime остаётся `focused` до успешного commit, а посещённые history entries
переходят в `retained`. Native host связывает physical stack entry с точным
runtime key, показывает fallback только для нового target и сохранённую
presentation для retained target. Query не входит в screen identity, Route
params входят. `fsm` пока остаётся пустой целью export map.

| Import                   | Файл              |
| ------------------------ | ----------------- |
| `@sellgar/app`        | `core/index.ts`   |
| `@sellgar/app/react`  | `react/index.ts`  |
| `@sellgar/app/native` | `native/index.ts` |
| `@sellgar/app/fsm`    | `fsm/index.ts`    |

Доступность определяется только `package.json#exports`. Deep imports запрещены.
Core не зависит от renderer entrypoints; renderer entrypoint использует core и
добавляет только platform-specific facade и bridge integration.
Renderer packages объявлены optional peer dependencies и нужны только consumer,
который импортирует соответствующий renderer entrypoint. `tsconfig.core.json`
отдельно компилирует `core/index.ts` без ambient renderer types.
