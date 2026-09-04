# `@sellgar/app`

- Статус пакета: development
- Статус реализации: in-progress

`@sellgar/app` — renderer-agnostic реализация application runtime и единый
источник framework-контракта для приложений Sellgar.

Пакет организован как набор корневых entrypoint-каталогов без общего `src`:

- `core/` → `@sellgar/app`;
- `react/` → `@sellgar/app/react`;
- `native/` → `@sellgar/app/native`;
- `fsm/` → `@sellgar/app/fsm`.

Native entrypoint повторяет публичные framework-понятия React facade:
`Application`, configurator, `Module`, `Layout`, `Widget`, renderer features,
guards/reactive bridges, `Route`, `Router`, `Shell`, navigation controls и
controller/revalidation hooks. Оба adapter-а используют один core lifecycle и
одинаковый bootstrap flow; различаются только renderer-specific presentation и
router bridge. Android fixture находится в `clients/mobile`. Native stack
projection использует хронологические core history entries и общие activation
runtimes, а физические переходы выполняет закрытый адаптер React Navigation
Native Stack. Новый screen сразу показывает локальный
fallback, возврат к retained screen сразу показывает сохранённые данные и затем
запускает scoped revalidation тех же controller instances. Back во время
`preparing` отменяет transition и мгновенно возвращает committed presentation.
Query не меняет identity screen; Route path и params меняют её.

Все entrypoints принадлежат одному package и разрешаются полем `exports` в
[package.json](package.json). Renderer-зависимости объявлены optional peers и не
становятся обязательными зависимостями core-only consumer; отдельный
`typecheck:core` компилирует только публичный core facade без ambient React
types. Compile-time fixtures дополнительно фиксируют React facade, отсутствие
compatibility aliases, exact params для `to()`/`through()` и React navigation
controls. Реализация начата с renderer-independent route graph,
structured address и navigation resolution. В `core` находятся базовые DI
contracts/scope, session state, application store,
initializers, application feature activation, runtime failure flow, disposable
registry и единый Application lifecycle.

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
Защищённый `401` полностью поглощается этим application boundary: конкурентные
ошибки объединяются в одну recovery operation, notifier выполняется до перехода
в `anonymous`, а `SessionRuntimeState.expire()` активно завершает зависшие
runtime operations без передачи исходной ошибки контроллеру. Обычные
`setAuthenticated()`/`setAnonymous()` остаются управляемыми переходами: action
входа или выхода физически завершается, но его stale result не публикуется.
Renderer-independent `ApplicationEventBusInterface` также является singleton
того же ApplicationScope: Module, Route и Widget runtimes обмениваются
типизированными событиями без зависимости от renderer adapter. `publish()`
ожидает async handlers, но изолирует ошибку отдельного подписчика через общий
runtime failure flow. `createScope()` группирует подписки конкретного владельца,
а application dispose гарантированно очищает оставшиеся регистрации.
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
Module view получает свой ModuleScope и typed controller runtime через
React contexts; публичный adapter экспортирует reference hooks `useController`,
`useLoaderData`, `useSubmit`, `useParams`, `useRevalidate` и `useDependency`.
React guard adapter экспортирует `useGuard` и прозрачный `Guarded`: оба
выполняют renderer-neutral declarations через единый последовательный
`GuardRunner` в текущем runtime scope. Массив declarations сохраняет семантику
`AND/all`, отказ возвращает `false` либо показывает `fallback`, а ошибка guard
передаётся ближайшей React exception boundary.
Controller actions выполняются на активном runtime через guards и общий
operation/failure flow; исходный payload передаётся без сериализации, а submit
state изолирован по controller token. Recoverable ошибка остаётся в submit
state, и только явная runtime escalation переводит ModuleRuntime в `failed`.
Локальный revalidate сохраняет ModuleScope,
controllers, providers и текущие loader data, параллельно выполняет guarded
loaders и явный provider `revalidate` без повтора `initialize`/`prepare`/`activate`
и без initial fallback. Global и targeted
operations имеют observable state, последовательно supersede-ят устаревшую
operation и не применяют late result после abort, session revision либо dispose.
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
superseded revalidation не публикует late result. React entrypoint владеет
`@Widget`, `WidgetHost`, `useWidgetProps` и локальными fallback/exception,
включая render error boundary; core не импортирует presentation types.
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
Core `RouterRuntime` собирает эти boundaries в иерархический logical state:
локальная Route-ветка каждого Router scope хранится отдельно от дочернего Router
и его owner Route. Это сохраняет основной screen при открытии nested routing,
включая Router на ancestor Route. Переход готовится транзакционно: resolve и
policies выполняются до parallel module preparation, предыдущая ветка остаётся
committed до явного commit, а discard/supersede освобождает только кандидата.
Presentation snapshot не подменяет committed Route-цепочку candidate runtime до
commit. Пока новая ветка готовится, renderer показывает один fallback ближайшей
изменяемой boundary текущей committed-ветки; shell целевой вложенной ветки при
этом не монтируется. Если committed-ветки ещё нет, всю initial preparation
закрывает application splash. Переход, меняющий только дочерний Router,
сохраняет owner Module и показывает один fallback внутри его shell, не раскрывая
pending Route-цепочку.
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
