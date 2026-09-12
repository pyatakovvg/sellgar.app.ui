# RFC: универсальное ядро, renderer adapters и router bridge

- Статус документа: target
- Статус RFC: accepted
- Статус реализации: in-progress
- Последнее согласование: 2026-09-02

## Назначение

RFC фиксирует согласованную архитектуру `@sellgar/app`. Реализация и публичный
контракт находятся в этом package; документ дополняет current design и фиксирует
согласованные semantic delta.

Базовое ограничение миграции: разделение core, renderer adapter и router bridge
не меняет наблюдаемую framework-механику само по себе. Lifecycle, scope,
navigation, loading, revalidation, errors и history сохраняются; намеренное
изменение поведения допустимо только как отдельно согласованный semantic delta.

Согласованный 2026-08-26 redesign provider lifecycle в разделе 15 является
таким semantic delta: целевая модель не переносит старые provider phases
механически, а выводит hooks из общей state machine runtime.

Согласованный 2026-08-26 React overlay host также является semantic delta:
порядок application, frame, modal и notification задаётся единым renderer host
и DOM-последовательностью, а не временем открытия независимых portal или
локальными `z-index`.

Согласованный и проверенный 2026-08-29 redesign query также является semantic
delta. Query больше не является одним глобальным плоским пространством: каждый
активный Router scope владеет собственным query. В web query root Router
сериализуется до `#`, а query активного вложенного Router — после его hash-address.
Класс с `@Query()` объявляет принадлежащее controller подмножество ключей внутри
одного Router scope и является единицей conversion, validation и serialization.
Data controller агрегирует независимые query-срезы вариативным
`query.get(QueryA, QueryB, ...)`, не вводя общую дублирующую declaration и не
получая ownership над записью этих срезов.

Согласованная 2026-08-30 navigation history semantics также является semantic
delta. Core владеет общей хронологической history и поддерживает два режима
runtime retention: `retain` сохраняет Route activations, а `release` сохраняет
только logical navigation entries и освобождает неактивные runtime. Renderer
bridge один раз выбирает режим для приложения; сами history, lifecycle и оба
алгоритма остаются core state machine без platform conditions. Все переходы
вперёд, включая переходы через tab, link, navigation item и imperative API,
проходят один pipeline. В `retain` Route runtime координирует сохранённые
activations locations: возврат к ним не запускает loaders или revalidation. В
`release` Back подготавливает новую activation и заново выполняет Module
lifecycle. React web выбирает `release`, React Native — `retain`. Native
дополнительно задаёт двойной Back для выхода с корня policy-ветки; это platform
presentation общей core history.

Согласованная 2026-09-01 React Native screen presentation также является
semantic delta. Новый physical screen создаётся по опубликованной core pending-
активации до завершения её асинхронной подготовки. Fallback, готовый Module и
boundary outcome являются последовательными состояниями content одного screen,
а не отдельными слоями поверх предыдущего screen. Native transition начинается
с появлением этого screen и не перезапускается после завершения loader. Core
по-прежнему владеет candidate runtime, commit, history и lifecycle; renderer
владеет только physical presentation и связывает её с authoritative core
projection.

Согласованная 2026-09-06 модель retained physical presentation уточняет эту
границу. Core по-прежнему является единственным владельцем logical history и
Route activations. Native adapter проецирует множество уникальных retained
activation identities в renderer-owned registry физических presentation. Этот
registry не является второй history: он не хранит порядок переходов, Back,
Route, token или navigation action. Его назначение — оставить React subtree
retained screen смонтированным и скрытым, пока соответствующая activation
существует в core. Одна identity всегда соответствует одному physical screen,
даже если core history содержит несколько позиций, ссылающихся на одну
activation.

Переход на текущую архитектуру не сохраняет backward compatibility как
отдельное требование.
Старые имена и aliases удаляются вместе с переводом consumers; наличие временного
alias в промежуточной реализации не делает его частью целевого public contract.

Текущая реализация и её зависимость от React Router разобраны в
[аудите](../19-react-router-dependency-audit.md).

## Статусы решений

- **Согласовано** — решение подтверждено владельцем и входит в целевой контракт.
- **Открыто** — направление обсуждается; форму API реализовывать нельзя.
- **Отклонено** — вариант рассмотрен и не должен возвращаться без нового решения.

## Цель

Разделить framework на независимое ядро и renderer adapters:

```text
@sellgar/app
@sellgar/app/react
@sellgar/app/native
@sellgar/app/fsm       # optional future adapter
```

`@sellgar/app/native` является конкретным React Native adapter, а не обобщённым
контрактом для произвольных native renderers. Другие native-технологии в
package topology не предполагаются. Потенциальная FSM integration получает
отдельный adapter `@sellgar/app/fsm` и не расширяет ответственность `native`.

Ядро владеет application lifecycle, DI, controllers, loaders, actions,
providers, runtime operations, router state, navigation pipeline, policies,
revalidate и обработкой ошибок. Оно не импортирует React, React Router или React
Native.

Renderer adapter типизирует и принимает renderer-specific declarations,
создаёт host/outlet и связывает логический runtime с конкретным render engine.
Router bridge независимо связывает логическую навигацию с URL, native
navigation state, deep links или FSM.

## Согласованные решения

### 1. Application и renderer facade

- В ядре существует одна реализация `Application` и один lifecycle.
- Каждый renderer экспортирует типизированный facade с тем же именем
  `Application`.
- Конкретное приложение пишется под одну платформу. Один product application
  class не обязан переиспользоваться между React и React Native.
- `compose()`, `initialize()`, lifecycle subscription и `dispose()` сохраняют
  текущую семантику core Application. Renderer facade типизирует и предоставляет
  только renderer-specific host result: например, React-версия `createView()`
  возвращает React component, не протаскивая `React.FC` в core.
- Router bridge передаётся один раз при bootstrap приложения, а не импортируется
  routes, modules или controllers.
- Deployment `basePath` является настройкой web bridge, а не Router и не Route.

Концептуальный bootstrap:

```ts
const app = new ManagementPanelApplication({
  routerBridge: createWebRouterBridge({
    basePath: import.meta.env.BASE_URL,
  }),
});

app.compose();
const AppView = app.createView();
void app.initialize();
```

### 2. Renderer-specific declarations

- Все declarations, принимающие или возвращающие render-сущности, публично
  принадлежат renderer adapter.
- Одинаковые понятия экспортируются под одинаковыми именами: `Application`,
  `Module`, `Layout`, `Widget`, renderer-specific часть `Route`, fallback,
  exception и shell declarations.
- `@UseBindings`, controllers, providers, DI, loaders и actions принадлежат
  `@sellgar/app`.
- `bindings` не является полем metadata `Module`; bindings подключаются только
  через `@UseBindings()`.
- Разработчик отвечает за подключение module, адаптированного к выбранному
  renderer. Несовместимый lazy export должен завершаться понятной ошибкой до
  запуска controllers, loaders и providers.
- Это правило распространяется и на application features. Их полный lifecycle,
  границы core/adapter и контракты уже реализованных notification, user request
  и navigation blocker зафиксированы в разделе 5.
- Renderer-specific `ApplicationConfiguratorInterface` сохраняет привычные
  вызовы `components()`, `features()`, `layouts()`, `routing()` и `router()`, но
  типизирует их render-поля сущностями своего renderer. Инициализаторы и
  `@UseBindings()` остаются core declarations.
- Renderer hooks и hosts (`useController`, `useLoaderData`, `useSubmit`,
  `useParams`, `useRevalidate`, `useDependency`, `NavItem`, `Guarded`, reactive
  component wrapper и Router/Widget hosts) экспортируются соответствующим
  renderer adapter. Их controller/runtime/services и observable state остаются
  в core; adapter не реализует второй lifecycle.
- `Entity`, `EntityCollection`, weak-registration и операции обновления
  сущностей являются renderer-neutral core-механикой. Конкретная observable
  library остаётся внутренней реализацией framework и не протекает в domain
  classes. React adapter экспортирует только прозрачные bridges `Reactive` и
  `reactive`; они не создают отдельный runtime owner или lifecycle.

Пример формы declaration:

```tsx
import { UseBindings } from '@sellgar/app';
import { Module } from '@sellgar/app/react';

@UseBindings(UsersBindings)
@Module({
  view: UsersView,
  fallback: <UsersFallback />,
  layouts: [UsersLayout],
  providers: [UsersProvider],
})
class UsersModule {}
```

### 3. Module и frame package

- `Frame` заменяется `Module`; целевой public contract не экспортирует
  compatibility alias `Frame = Module`.
- Реализация declaration одна; отдельной реализации `@Frame` нет.
- Целевая runtime-цепочка едина для root и вложенных routes:
  `RouterRuntime -> RouteRuntime -> ModuleRuntime`.
- `RouterRuntime`, `RouteRuntime` и `ModuleRuntime` остаются разными runtime
  owners со своей ответственностью. Отдельного `FrameRuntime` как четвёртого
  вида runtime в целевой модели нет.
- `RouteRuntime` владеет route scope, policies, params, route providers,
  layouts и boundary state. `ModuleRuntime` владеет lazy import, module scope,
  controllers, loaders, actions, module providers/layouts и локальным состоянием
  controller operations.
- Общая низкоуровневая работа с загруженным module instance может оставаться
  внутренней реализацией `LoadedModuleRuntime`, но не образует публичного
  runtime owner.
- Renderer-декларация `@Shell` сохраняет механику текущего `@FrameShell`, но
  получает имя без устаревшей frame-семантики. В целевой модели shell принадлежит
  renderer/router host вложенного Router, а не `@Module`.
- `load: () => import(...)` имеет одну механику для modules и вложенных routes.
- Framework не выбирает renderer-specific module автоматически. Ошибка выбора
  package остаётся ошибкой разработчика.

### 4. Widget как встраиваемый runtime owner

- `Widget` является отдельным first-class runtime owner для изолированного
  переиспользуемого блока с собственной process logic. Он не сводится к
  renderer component и не превращается в разновидность `Module`.
- Widget не является Route, не участвует в Router tree, не имеет собственного
  logical address и не активируется navigation operation. Renderer presenter
  встраивает его через свой `WidgetHost`.
- Core владеет `WidgetRuntime`, `WidgetScope`, controllers, loaders, actions,
  providers, operation coordination, process state, revalidation, failure и
  cleanup. `@Widget`, его `view`/`fallback`/`exception` и `WidgetHost`
  типизируются renderer adapter без второго lifecycle.
- Widget получает данные embedding context через типизированные `props`.
  Собственных Route params у него нет; controller args Widget содержат `props`,
  `payload` для action и `signal` по общему core contract.
- WidgetScope является child фактического owner scope и наследует доступные ему
  application/framework dependencies, но controllers, providers, loader data,
  submit state и revalidate state принадлежат конкретному WidgetRuntime.
- Ошибка Widget loader/provider/render переводит в `failed` только этот runtime
  и отображает его локальный либо application fallback/exception внутри
  конкретного host. Owner Module, соседние Widgets и Route branch остаются
  активными.
- Widget instance имеет стабильную identity:

```text
owner scope + widget token + (runtimeKey ?? default key)
```

- Несколько одновременно встроенных `WidgetHost` с одной identity намеренно
  используют один WidgetRuntime, одни controller/provider instances, loader
  data и process states. Это не configuration error.
- `runtimeKey` не нужен для обычного единственного embedding. Он используется,
  когда в одном owner scope одновременно присутствуют несколько компонентов
  одного Widget token и разработчик выбирает: одинаковый key, включая default,
  сохраняет общий runtime; разные keys создают независимые runtimes.
- Одинаковые token и `runtimeKey` в разных owner scopes не объединяют runtimes.
  Widget никогда не превращается в скрытый application singleton.
- Renderer host получает lease на runtime identity. Удаление одного из
  нескольких host не dispose-ит общий runtime; cleanup выполняется после
  освобождения последнего host/preload lease либо при dispose owner scope.
- Widget preload использует ту же identity и подготавливает тот же runtime,
  который затем получают host. Render не запускает повторный loader после
  успешного preload.
- Rerender presenter, React StrictMode replay, native detach/freeze и возврат к
  retained screen не создают новый WidgetRuntime. Retained owner сохраняет и
  принадлежащие ему Widget runtimes; фактическое удаление embedding или owner
  запускает child-to-parent cleanup.
- Widget revalidation перезапускает loaders существующих controller instances и
  не пересоздаёт WidgetRuntime. Widget-local вызов не ревалидирует owner Module,
  Route или соседние Widgets.
- Изменение props обновляет общий runtime input, но само по себе не считается
  navigation и не должно обходить operation/revision guards. Если несколько
  host используют одну identity, каждый из них может передать новое значение
  props; последнее принятое runtime-обновление заменяет предыдущее значение для
  общего WidgetRuntime и всех его consumers. Порядок определяется принятием
  обновления runtime, а не renderer render side effect: superseded и late
  updates не применяются. Уже начатая operation использует snapshot props,
  захваченный при её запуске, а следующая operation получает последнее принятое
  значение. Разные `runtimeKey` создают независимые runtimes и независимые props.
  Публичный API WidgetHost для этой семантики не расширяется.

### 5. Application features и renderer presentations

#### Общий контракт

- Feature является framework-level capability в `ApplicationScope`, а не
  product business feature, Route, Module или Widget. Она подключается через
  сохраняющий текущую семантику вызов `app.features([...])` и живёт до dispose
  приложения независимо от переходов между Route-ветками.
- Feature не образует новый универсальный runtime owner. Если capability нужен
  собственный runtime состояния, им владеет сама capability: например,
  `NotificationRuntime`, `UserRequestRuntime` или
  `NavigationBlockerRuntime`.
- Core владеет service tokens, runtime state, operations, очередями,
  subscriptions, cleanup и bindings feature. Bindings по-прежнему
  подключаются через `@UseBindings()`; поля `bindings` в feature options нет.
- Renderer adapter владеет одноимённым публичным Feature facade,
  `Presentation`, view props, hooks и application layer/host. React facade
  принимает React components, Native facade — React Native components. Ни один
  из этих типов не попадает в core source или публичный core `.d.ts`.
- `ApplicationFeatureInterface.createLayer(): React.ReactNode` не является
  допустимым core-контрактом. Core активирует capability и её bindings ровно
  один раз; renderer host отдельно монтирует соответствующий layer в том же
  `ApplicationScope`. Это внутреннее разделение не меняет публичный вызов
  `app.features([...])` и не создаёт второй lifecycle.
- Renderer layer монтируется на уровне приложения после готовности Application,
  вне Route tree. Переход, revalidate, remount Route/Module, web hash change,
  native screen blur либо tab switch не пересоздают feature runtime.
- Ошибка активации feature bindings во время compose остаётся ошибкой
  Application. Ошибка renderer presentation не изменяет core state feature и
  проходит renderer/application render boundary, а не Route или Module
  runtime boundary.
- Renderable части payload типизируются facade выбранного renderer. Core
  хранит и передаёт такое содержимое как непрозрачное значение и не выполняет
  над ним render-specific операций. Семантические поля, результаты операций и
  правила очередей остаются core-контрактом.
- Один и тот же service/runtime token используется renderer facade; adapter не
  регистрирует параллельный service и не дублирует состояние capability.

#### Web React overlay host

- Web React adapter различает четыре уровня presentation: application, frame,
  modal и notification. Application отображается в корневом контейнере host;
  renderer автоматически создаёт непосредственно в `body` следующие за ним
  стабильные sibling-контейнеры frame, modal и notification именно в таком
  порядке.
- Frame layer принимает nested Router shells, modal layer — user request,
  navigation blocker и другие dialog-сценарии, notification layer —
  уведомления. Более высокий уровень всегда расположен в DOM позже нижнего.
- Один application-level `OverlayHost` создаёт, упорядочивает и освобождает
  контейнеры вместе с React Application. Feature, Router, Route, shell,
  presentation и bootstrap не принимают selector, portal anchor, root element
  или `z-index`.
- Все renderer layers остаются частями одного React tree. Вложенный portal
  presentation наследует контейнер своего уровня и не создаёт независимый
  body-level root, порядок которого зависел бы от времени открытия.
- DOM-порядок слоёв является framework invariant. CSS `z-index` не используется
  для исправления межслойной модальности; локальный presentation не может
  перенести себя на другой уровень.
- Native adapter сохраняет ту же application-level композицию и тот же порядок
  `application -> frame -> modal -> notification` через собственный
  `OverlayHost`. В отличие от web ему не требуется DOM portal, однако frame
  остаётся sibling основной content-проекции и не может стать дочерним узлом
  application/Router/Route Layout либо screen transition.

Форма конфигурации остаётся одинаковой для renderer adapters:

```tsx
import { NotificationServiceInterface } from '@sellgar/app';
import { NotificationFeature, NotificationPresentation } from '@sellgar/app/react';

app.features([
  NotificationFeature.configure({
    presentation: NotificationPresentation.define((registry) => {
      registry.info(InfoNotificationView);
      registry.success(SuccessNotificationView);
      registry.destructive(DestructiveNotificationView);
    }),
  }),
]);
```

`@sellgar/app/native` экспортирует те же имена и ту же форму конфигурации, но
типизирует presentation React Native component types.

#### NotificationFeature

- `NotificationServiceInterface` и application-scoped notification runtime
  остаются в core. `show()` добавляет notification в очередь и возвращает
  handle с `id` и явным `close()`.
- Core сохраняет semantic statuses `info`, `success`, `destructive`, порядок
  очереди, manual close, optional auto-close, timeout и pause/resume таймера.
  Текущие defaults сохраняются: status `info`, auto-close выключен, а при его
  включении timeout равен `5000` ms, если явно не задан другой.
- `title`, `description`, `slot` и другие renderable payload values
  типизируются renderer adapter. Placement и interaction, которыми adapter
  вызывает pause/resume, также принадлежат renderer: web React adapter
  сохраняет текущие восемь placements, default `bottom-right`, pause по
  hover/focus и resume после ухода фокуса/указателя.
- `NotificationPresentation` сопоставляет semantic status с renderer view.
  Отсутствие presentation для фактически показанного status завершается явной
  configuration error, а не молчаливым fallback на случайный view.
- React `NotificationLayer` отображается в notification container общего
  `OverlayHost` и является реализацией только web React adapter. Native host
  отображает ту же core queue средствами своей платформы.

#### UserRequestFeature

- `UserRequestServiceInterface` и application-scoped FIFO runtime остаются в
  core. Поддерживаются текущие операции и результаты: `alert -> void`,
  `confirm -> boolean`, `prompt -> string | null`.
- В каждый момент presentation получает первый request очереди. Apply/cancel
  завершают promise текущего request с существующей семантикой и открывают
  следующий: confirm возвращает `true`/`false`, prompt — введённую строку либо
  `null`, alert завершается без значения.
- `title`, `description`, `applyText`, `cancelText` и другие renderable values
  типизируются renderer adapter. Renderer-neutral input data вроде
  `defaultValue` и `placeholder` остаются частью semantic payload.
- `UserRequestPresentation` независимо сопоставляет `alert`, `confirm` и
  `prompt` с renderer views. Для используемого kind отсутствие presentation
  остаётся явной configuration error; runtime не подменяет её автоматическим
  cancel/default result.
- React layer и native modal/screen являются разными hosts одной core queue, а
  не разными реализациями user-request lifecycle.

#### NavigationBlockerFeature

- Conditions, boundary registrations, scoped `allow()`, pending transition,
  `leave`/`stay` и решение о том, какие boundaries покидает переход, остаются в
  core navigation pipeline. Глобальная и локальная presentations, view props,
  `useBlocker` и renderer layer принадлежат adapter.
- Core service/runtime больше не принимает и не хранит
  `NavigationBlockerPresentation`. Core pending decision предоставляет adapter
  только стабильные identities блокирующих registrations в детерминированном
  порядке.
- Renderer hook регистрирует condition в core и при наличии локального
  presentation связывает его с identity той же registration в adapter-local
  registry. При dispose регистрации удаляются и core condition, и renderer
  mapping.
- Сохраняется текущий выбор presentation: локальная presentation ближайшей
  вложенной Router boundary имеет приоритет над parent Route presentation; для
  registrations одного уровня приоритет имеет последняя регистрация. Если ни
  одна блокирующая registration не задала local presentation, используется
  глобальная presentation из `NavigationBlockerFeature.configure(...)`.
- Controller-level `NavigationBlockerServiceInterface` остаётся
  renderer-independent и не принимает view. Local presentation доступна только
  через renderer API, например React `useBlocker`.
- Registration принимает необязательные синхронные `onLeave` и `onStay`. Core
  вызывает выбранный callback каждой registration, фактически участвовавшей в
  блокировке перехода, до разрешения pending decision. Ошибка callback не
  отменяет уже выбранное пользователем решение.
- После `leave()` или `stay()` pending decision немедленно исчезает из публичной
  проекции, поэтому presentation закрывается сразу и не остаётся поверх
  fallback либо следующего screen до окончания navigation operation. Core
  внутренне удерживает принятое решение до завершения этой операции, но не
  публикует renderer-у отдельный `inProcess` для blocker presentation.
- Browser pre-commit/history bridge и нативный `beforeunload` confirmation
  принадлежат web bridge. Native adapter связывает то же core pending decision
  со своим navigator и renderer presentation без browser-specific механики.
  `beforeunload` callbacks не вызывает, поскольку браузер не сообщает core
  результат системного подтверждения.

### 6. Один Router и вложенные Router

- Отдельные семантики `FrameRouter` и `FrameRoute` не должны дублировать обычные
  `Router` и `Route`.
- Полный Router contract сохраняет boundary-возможности текущего `FrameRouter`:

```ts
new Router({
  canMatch: [],
  canActivate: [],

  layouts: [],
  providers: [],

  fallback,
  exception,
  forbidden,
  notFound,

  shell: DetailsShell,
  routes: [],
});
```

- Только `routes` является обязательным полем; массив не может быть пустым.
  Остальные Router boundary fields optional.
- `canMatch`, `canActivate`, `providers` и routes structure типизируются core.
  `layouts`, render boundaries и `shell` типизирует renderer adapter.
- `baseUrl` принадлежит bridge. Отдельный `baseSource` Router не нужен:
  logical address складывается из локальных `address` дочерних Routes.
- Router остаётся владельцем собственной boundary. Перенос её policies,
  providers, layouts или render states на родительскую Route изменил бы scope и
  потребовал бы искусственную structural Route.
- `shell` остаётся renderer-specific presentation surface Router и не
  переносится в `@Module` или Route. Он нужен только adapter-у, которому для
  вложенной Route требуется отдельное место размещения её presentation.
- В текущем web adapter `shell` реализует контракт `@Shell`: он создаёт
  frame/portal на странице, внутри которого renderer отображает Module
  вложенной Route. Для такого adapter shell разрешается как
  `Router.shell ?? rendererDefaultRouterShell`: локальная декларация имеет
  приоритет над renderer default.
- Web React adapter монтирует активные nested Router shells в одном
  application-level layer рядом с presentation корневого Router. Shell не
  становится DOM-child владеющего Route/Module, но остаётся в том же
  React tree, ApplicationScope и framework lifecycle.
- Web React host отображает активный shell в стабильном frame container общего
  `OverlayHost`. Presentation shell существует только пока активен
  соответствующий nested Router; порядок нескольких shell определяется их
  порядком внутри frame layer, а порядок frame относительно modal и notification
  — фиксированной DOM-последовательностью renderer layers.
  Renderer-specific implementation `@Shell`, например `Drawer`, владеет
  визуальным chrome, interaction и закрытием, но не ищет DOM anchor.
  `app.routing()`, `Router`, Route и router bridge не принимают DOM selector,
  portal root или z-index. Web bootstrap создаёт один React root; portal остаётся
  частью того же React tree, отдельный React root для shell не допускается.
- Core не требует `shell` у Router: это renderer-specific declaration и поэтому
  не является core configuration error. React и React Native adapters считают
  `Route.routing` отдельной shell-presentation и разрешают её одинаково как
  `Router.shell ?? app.routing({ shell })`; отсутствие обоих вариантов является
  renderer configuration error. Обычная глубина `Route.routes` остаётся native
  screen/Stack flow и не требует shell.
- `shell` не выбирает navigation algorithm. В частности, соответствие Router
  native Stack, Tabs или Drawer принадлежит React Native bridge/renderer
  projection, а не `@Shell`.
- Core не классифицирует Router как web, Stack, Tabs, Drawer или FSM и не
  содержит platform conditions для выбора presentation. Одинаковые `Router`,
  `Route` и `routing` получают конкретную семантику размещения только в
  подключённом renderer adapter/router bridge.
- Root Router shell не используется текущим web adapter. Другой renderer
  создаёт root navigation host по собственному adapter contract без требования
  оборачивать root Router в frame shell.
- Route tree и renderer presentation настраиваются раздельно:

```ts
app.router(ApplicationRouter);

app.routing({
  shell: BaseShell,
  fallback,
  exception,
  forbidden,
  notFound,
});
```

- `app.router(...)` регистрирует только root Router. `app.routing(...)` является
  renderer-specific конфигурацией presentation вложенных Router и заменяет
  прежнее имя `app.frames(...)` без смешивания этих ответственностей.
- В web adapter `app.routing` сохраняет полный presentation contract вложенного
  Router, а не только default shell. Локальная Router boundary имеет
  приоритет, затем используется `app.routing`, затем application-level
  components. Renderer, которому frame shell не нужен, не обязан включать
  `shell` в тип своих options.
- `app.frames(options)` в целевой API отсутствует. Consumers переводятся на
  `app.routing(options)` без compatibility alias; отдельный frame configurator
  не сохраняется.
- Route может владеть одним или несколькими вложенными Router через
  `routing: Router[]`. Имя свойства описывает внутренний routing-механизм
  Route, а не пользовательскую navigation operation.
- Вложенный Router является внутренним navigation scope; отдельная публичная
  декларация `NavigationScope` не нужна.
- В публичном Router не вводятся обязательные `activation`, `history`,
  `retention` и другие platform-specific флаги.
- `routing: Router[]` описывает доступные из Route вложенные Router-кандидаты,
  а не набор параллельных outlets и не несколько заранее committed веток.
- Каждый Router является отдельным logical address scope. Сам Router segment не
  добавляет; address внутри scope складывается только из локальных `address`
  выбранных Routes.
- `Route.routes` продолжает Route-ветку внутри того же Router scope и поэтому
  продолжает его address. `Route.routing` вводит дочерний Router и начинает
  новый независимый address scope: address родительского Router в него не
  конкатенируется.
- Committed navigation state является иерархией Router scopes, а не одной
  плоской Route-цепочкой. Внутри каждого Router committed ровно одна Route-
  ветка. Вдоль неё может быть активирован не более чем один дочерний Router из
  всех `routing` candidates активных Routes; дочерний scope рекурсивно следует
  тем же правилам.
- Активация дочернего Router не заменяет и не пересоздаёт committed Route-ветку
  владельца. Если Route-владелец загружает основной screen Module, он и Module
  выбранной вложенной Route живут одновременно в независимых runtime branches
  под общей активной Route-ancestry. Вложенный Router всегда является child
  объявившего его RouteScope, а не ModuleScope основного screen; routing-only
  Route собственного ModuleScope не создаёт.
- Вложенные Routers, объявленные на любом узле активной Route-ветки, доступны её
  активным потомкам. Runtime и scope Router принадлежат Route, где он объявлен.
  Router неактивного Route недоступен; при пересекающихся address candidates
  приоритет имеет ближайший активный владелец, как в текущем frame routing.
- При внешнем переходе bridge декодирует transport в scoped logical location.
  Core сначала разрешает Route-ветку root Router, затем сопоставляет address
  дочернего scope только с `routing` candidates активной Route-ветки его
  владельца. Валидный candidate должен разрешить свой address целиком с учётом
  index/default semantics. До завершения resolve Application не знает, какой
  candidate будет выбран.
- Если Router candidate распознал принадлежащий ему leading address, но остаток
  не разрешился в дочернюю Route, это `notFound` данного Router/Route boundary,
  а не отсутствие вложенного scope. Полностью чужой address, не распознанный ни
  одним доступным candidate, вложенный runtime не активирует. Тем самым
  сохраняется различие текущего frame matcher между unknown child и другим
  `baseSource`.
- После resolve commit получают только выбранные Route-ветки затронутых Router
  scopes. Невыбранные candidates не активируют Module, controllers или
  providers.
- Для перехода core разрешает target token вместе с его Router-scope ancestry,
  находит общий committed state и вычисляет diff затронутых scopes. Если scope-
  владелец уже активен, его основная Route-ветка сохраняется. Если владелец
  неактивен, необходимая родительская ветка входит в ту же transaction.
- Новые runtime подготавливаются без уничтожения committed state. Commit
  атомарно заменяет только затронутые Router scopes; фактически удаляемые из
  navigation state runtime dispose-ятся child-to-parent, общая активная ancestry
  сохраняется, а неактивные activations сохраняются только в режиме `retain`.
- На initial direct navigation после успешных policies основная Module-цепочка
  и выбранная вложенная Router-цепочка могут готовиться параллельно под общим
  application splash. Подготовленный вложенный runtime затем переиспользует
  renderer host, а не запускает повторный load после mount.
- Native tabs и stack presentation не превращают `routing: []` в параллельные
  активные core outlets. Внутри Router по-прежнему focused ровно одна Route-
  ветка. Ранее посещённые ветки сохраняет core activation registry; platform
  navigation state лишь проецирует его snapshot.
- Core Application предоставляет renderer adapter read-only проекции registry
  уникальных activation, хронологических history entries и target navigation
  текущей pending-операции. Activation projection имеет стабильный id,
  единственную lifecycle-phase и immutable Router/Route runtime tree. History
  entry имеет собственный стабильный id и ссылку на activation, содержащую
  согласованные navigation snapshot и runtime tree; в `release` неактивная entry
  не удерживает runtime. Несколько entries могут ссылаться на одну activation,
  но не присваивают ей разные phases. Pending navigation публикуется до ожидания
  асинхронной подготовки, не является history entry и исчезает при commit либо
  discard. Renderer не смешивает отдельно наблюдаемый Application navigation
  snapshot с runtime tree другой ревизии: committed path и tree всегда читаются
  из одной focused history entry. Ни одна projection не разрешает renderer
  менять history, focus или lifecycle и не добавляется в публичный Router API.
- Исходный root-navigation request без разрешённого Route path не является
  pending screen projection: до выбора candidate adapter показывает Router
  fallback и не создаёт фиктивный physical screen. После resolve и успешных
  `canMatch`/`canActivate` `RouterRuntime` одновременно публикует canonical
  candidate navigation и его pending runtime branch. Это происходит до ожидания
  providers/loaders. Успешный transition сначала фиксирует runtime и core
  history, затем синхронно передаёт committed projection bridge и только после
  этого снимает pending projection. Поэтому один logical screen не исчезает
  между fallback и content и не получает повторную present-анимацию. Discard,
  interruption и новая revision также согласованно очищают обе pending-проекции.
- Пока navigation transaction не завершена, повторный эквивалентный request не
  отменяет и не запускает её заново, а присоединяется к тому же in-flight
  Promise. Эквивалентность включает Router/Route path, params, query, boundary,
  initiator, nested address, revalidation, replace и state. Только другой request
  создаёт новую revision и прерывает предыдущую transaction. Поэтому несколько
  уже доставленных событий одного control не способны освободить runtime,
  который всё ещё участвует в одной physical presentation.
- Renderer читает core projections заново при каждом наблюдаемом событии
  Application/RouterRuntime, а не хранит полученный ранее массив как logical
  navigation state.
  Core сначала атомарно фиксирует новую history/focus projection, затем передаёт
  её bridge и только после завершения физической presentation освобождает
  activations, удалённые этой mutation. Bridge completion не меняет history и
  не управляет runtime lifecycle: это лишь подтверждение, что renderer больше
  не показывает вытесненную presentation. Web bridge завершает presentation
  синхронно; native bridge ждёт перехода screen-автомата в stable state.
- Native host выбирает текущую presentation по последней core history entry, а
  не выводит её из transient phase общей activation. Поэтому повторная ссылка
  history на уже focused activation не создаёт неоднозначность между двумя
  физическими позициями и не требует renderer-local угадывания focus.
- Для ещё не committed target native host создаёт pending physical presentation
  с deterministic identity из outlet depth, Route declaration и path params.
  Query в identity не входит. До commit presentation не считается core history
  entry и не меняет focus committed activation. Успешный commit публикует в
  focused history entry тот же Route и params, поэтому та же physical
  presentation заменяет fallback на committed content без remount; discard
  удаляет её и оставляет предыдущую committed presentation. Renderer не создаёт
  для candidate второй Module/controller/provider runtime: screen отображает
  именно runtime, подготовкой которого владеет core.
- React Native projection разделена на adapter и независимый screen renderer.
  `NativeNavigationHost` является adapter A -> B: читает authoritative core
  projections, рекурсивно строит outlet-ы и передаёт каждому из них единственную
  желаемую `ScreenPresentation | null`. Блок B является независимым автоматом
  физического отображения и не подключает `NavigationContainer`, `StackRouter`,
  navigator actions или собственную navigation state. Он знает только identity,
  content и готовую визуальную transition presentation: animation и физическую
  операцию `present | dismiss`. Back, token, history action, Route и причина
  смены presentation ему неизвестны.
  Наличие activation не означает, что Route обязана отображаться в tab bar.
  Anonymous и
  authenticated structural Route-ветки остаются обычными взаимоисключающими
  policy branches одного core Router: anonymous branch работает без tab bar,
  authenticated branch подключает основной Layout, который визуально выводит
  tab bar.
- `NativeNavigationHost` рекурсивно оставляет общую Route/Layout ancestry вне
  ближайшего screen renderer. В первом различающемся outlet adapter разрешает
  identity желаемой presentation из authoritative core projection и передаёт
  renderer текущую presentation вместе с уникальным множеством retained
  physical presentations этого outlet. Логические history positions и порядок
  переходов остаются только в core; registry блока B является производной
  physical storage и не способен выполнять навигацию. Повторный выбор той же
  presentation identity обновляет её content без remount и animation; новая
  identity создаёт новый физический screen. Освобождение activation в core
  удаляет соответствующую скрытую presentation после завершения текущего
  transition. Последовательные history entries, различающиеся только дочерним
  `Route.routing`, схлопываются для основной screen projection, поскольку frame
  отображается отдельным shell layer. Поэтому общий tab/layout не дублируется,
  а открытие или закрытие frame не создаёт обычный screen transition.
- Native `Screen` является общей физической единицей presentation, а не
  синонимом Route либо Module. Application route outlet, каждый frame layer и
  modal layer передают screen renderer одну стабильную presentation identity и
  заменяют fallback, positive либо negative content внутри неё без создания
  второго screen. Presentation compositor определяет единственный активный
  process в порядке `application < frame < modal` с учётом глубины вложенных
  frame. Покрытый overlay-слоем screen остаётся смонтированным, но перестаёт
  принимать input, скрывается от accessibility focus и приостанавливает
  screen-focus effects. Снятие верхнего слоя реактивирует предыдущий screen без
  navigation operation, fallback либо повторного loader. Native `Modal`
  сохраняет собственную modality и z-order; compositor управляет activity, а не
  заменяет platform modal обычным `View`.
- Pending forward navigation создаёт target screen в первом изменившемся content
  outlet. Layouts неизменившейся Route-ancestry остаются смонтированными вне
  physical transition и не дублируются. Первым содержимым target screen является
  разрешённый для его boundary fallback. Когда candidate runtime готов либо
  завершился boundary outcome, тот же screen без remount и второй navigation-
  операции заменяет fallback на Module, exception, forbidden или notFound.
  Target Route layouts и Module до commit не монтируются: fallback занимает весь
  изменившийся outlet, а готовая Route-ветка вместе со своими layouts появляется
  в нём атомарно только после commit. Если меняется structural policy-ветка и
  общей ancestry нет, fallback занимает всю Router presentation; layouts прежней
  ветки уже не показываются, а layouts новой ветки ещё не показываются. На initial
  navigation этот же prepare/commit скрыт application splash, поскольку
  Application переходит в `ready` только после завершения начальной Router-
  транзакции. Retained focus и Back к готовой retained activation не создают
  fallback.
- Визуальный tab bar принадлежит renderer Layout, а не core Router declaration.
  Layout собирает его из `TabItem`, использующего tokenized navigation factory
  и core navigation state. Active вычисляется относительно route target, а
  pending — относительно terminal route и params независимо от initiator:
  переход к `BrandsRoute` из Module, другого link либо самого tab одинаково
  переводит Brands tab в pending до commit. Переход к именованному дочернему
  Route не считается pending корневого tab. Поэтому подписи, иконки, порядок и
  наличие item являются presentation приложения; core не получает `tab`,
  `screen`, `icon` или другие React Native metadata.
- Успешный переход вперёд проходит общий navigation pipeline и добавляет позицию
  в хронологическую core Back-history. История не зависит от инициатора: одинаково
  обрабатываются tab, link, navigation item, imperative navigation и platform
  navigation event.
  Например, после `Products -> Brands -> Categories` последовательные Back
  возвращают `Categories -> Brands -> Products`. Возврат вперёд на уже
  посещённый screen с теми же Route path params фокусирует сохранённую activation
  одного Route runtime без fallback и повторного loader, но остаётся новой
  позицией пользовательской history. Повторная активация уже focused target не
  добавляет history entry и сохраняет общую семантику повторной активации active
  target.
- Core runtime retention задаётся обязательным bridge contract
  `runtimeRetention: 'retain' | 'release'`. Это выбор алгоритма общей state
  machine, а не platform flag `Router`/`Route` и не условие по имени renderer в
  core. Режим фиксирован для lifecycle Application и не меняется между
  отдельными navigation operations.
- В режиме `release` history entry после потери focus сохраняет navigation state,
  но больше не удерживает Route/Module/controller/provider runtime. Back проходит
  обычные policies/prepare/commit, создаёт новую activation и повторно выполняет
  loaders. Общая активная Route ancestry не пересоздаётся: открытие и закрытие
  вложенного frame сохраняет owner Module и освобождает только runtime frame;
  смена основного Route освобождает прежний основной Module. React web bridge
  выбирает этот режим, поэтому в web одновременно живут текущий основной Module
  и, при наличии, Module активного frame.
- Back при отсутствии незавершённой подготовки удаляет текущую верхнюю history
  entry. В `retain` он сразу фокусирует предыдущую retained entry: освобождаемый
  runtime graph очищается child-to-parent, а общие ancestor runtime и runtime,
  который всё ещё удерживается другой history entry, сохраняются. Удалённая
  activation остаётся retained до завершения физического dismiss и только затем
  освобождается core. Поэтому уходящий screen сохраняет готовый content на всей
  animation, а Back не показывает fallback/splash и не запускает loaders либо
  revalidation предыдущего screen. В `release` Back является новой подготовкой
  target и использует обычный route fallback до commit.
- До обращения к navigation blocker и history core передаёт Back intent
  локальным interceptions focused Route/Module runtime. Controller либо другой
  DI-владелец текущего runtime регистрирует interception через route-scoped
  `BackServiceInterface`, задавая `condition` и `handler`. Condition вычисляется
  в момент Back; первый enabled handler вызывается и поглощает intent без
  history mutation, route transition, fallback или screen animation. Если все
  conditions вернули `false`, выполняется обычный Back pipeline.
- Interceptions обходятся от самой глубокой focused Router boundary к
  родительской, а внутри одной boundary — от последней регистрации к первой.
  Retained runtime сохраняет свои регистрации, но не участвует в обработке,
  пока снова не станет focused. Регистрации освобождаются их владельцем либо
  автоматически при dispose Route runtime; повторный Back во время async
  handler считается обработанным и не запускает параллельную операцию. Ошибка
  handler не разрешает history pop как fallback.
- Back interception и navigation blocker имеют разные назначения. Interception
  обрабатывает локальное состояние текущего Module; blocker подтверждает уже
  определённый уход с Route boundary. Platform Back, gesture, header control и
  `navigate.back()` должны входить в один core Back intent pipeline; renderer
  только передаёт intent и показывает dismiss после фактического history pop.
  React Native adapter нормализует Android `BackHandler` и iOS leading-edge
  gesture в один `NativeBackRuntime.request()`. iOS gesture не изменяет
  physical screen stack напрямую: это сохранило бы вторую history и обошло бы
  core interception/navigation blocker до принятия решения.
- Native `Route` принимает необязательное renderer-specific свойство
  `animation`. При отсутствии свойства screen появляется и удаляется без
  анимации. Значение принадлежит только Route, на котором объявлено: дочерние
  `Route.routes`, соседние Routes и вся Router-ветка его не наследуют. Animation
  описывает визуальное появление и исчезновение физического screen. Входящий
  screen использует metadata своего terminal Route, а покидаемый — обратное
  направление собственной metadata. Предыдущий и новый screen
  остаются прикреплёнными на всё время transition; прежний screen удаляется
  только после её завершения. `present` и `dismiss` имеют независимые параметры
  длительности блока B: появление нового screen не обязано выполняться со
  скоростью удаления текущего. Adapter выбирает физическую операцию по источнику
  animation metadata и authoritative направлению core transition. Это сохраняет
  `dismiss` при Back между двумя history entries одного animated Route с разными
  params, но не передаёт блоку B navigation/history semantics.
  Блок B реализован registry уникальных presentation identities. В stable state
  только focused presentation видима и интерактивна; retained presentations
  остаются в том же React tree под `React.Activity mode="hidden"`, сохраняя
  component state и native view state, но приостанавливая effects и подписки.
  Во время transition одновременно видимы только source и target; после
  завершения source становится hidden либо удаляется, если adapter больше не
  передаёт её в retained projection. Новая presentation во время незавершённой
  animation отменяет прежнюю физическую операцию, считает её target визуальным
  source следующей операции и запускает только одну новую animation. Устаревший
  completion игнорируется по operation identity. Registry не содержит
  дубликатов для повторяющихся history positions и не переставляет native views
  местами. Поэтому renderer стремится к последнему желаемому визуальному
  состоянию без очереди конкурирующих transition и пустого промежуточного кадра.
  Правило не зависит от инициатора навигации и одинаково применяется к
  tokenized navigation, tab/link/navigation item, imperative navigation,
  `replace` и Back. При подготовке нового target native transition начинается с
  физического появления target screen, а fallback является его первым content-
  состоянием и движется вместе с ним. Готовность candidate заменяет content
  внутри уже показанного screen и не создаёт второй transition, mount или
  navigator action. Retained target не запускает fallback/loaders и начинает
  transition сразу с сохранённым content. Повторная активация уже focused target,
  query и revalidation не меняют выбранный screen и поэтому не запускают
  animation. Animation остаётся только native presentation metadata: она не
  меняет core history, lifecycle или pending и не применяется к
  `Route.routing`/`@Shell()`.
- Adapter формирует одну атомарную physical projection из application pending,
  последней подтверждённой bridge presentation и уникальных core runtime
  entries. Отдельные уведомления фаз core state machine не являются командами
  `create screen`. Изменение content той же identity, включая fallback ->
  Module, не создаёт новую physical operation. Target presentation входит в
  React tree в том же render, в котором adapter впервые получил новый pending;
  перенос входной presentation в локальный state через Effect запрещён.
  Layout effect допустим только на границе с фактической native animation и для
  подтверждения уже committed stable presentation внешнему bridge.
- Блок B сообщает adapter только о том, что переданная presentation достигла
  stable state. Adapter сопоставляет это событие с текущей bridge revision, а
  bridge завершает ожидающий `commit()`. Core после этого освобождает удалённые
  history mutation activations. Блок B не получает entry id, action, Back или
  runtime и не становится владельцем lifecycle; отменённая navigation revision
  завершает ожидание без зависшего commit.
- Native transition располагается в первом outlet после общей Route/Layout
  ancestry, в котором фактически меняется выбранный screen. Metadata берётся из
  terminal Route конкретной history activation, но не наследуется Route-узлами:
  renderer лишь проецирует её на границу расхождения source и target. Поэтому
  общие родительские Layouts остаются смонтированными и не анимируются, а
  исходящий глубокий screen сохраняет собственную обратную animation даже при
  переходе в соседнюю tab/Route-ветку. Неизменившиеся вложенные outlets не
  переигрывают animation. `push` вложенного Router, появление frame fallback и
  commit его Module также не меняют selection ordinary screen outlet.
- Route, разрешённый `Router.firstAvailable()`, является корневым anchor активной
  policy-ветки и нижней точкой её Back-history. На этом Route первый root Back не
  закрывает и не сворачивает приложение, а только взводит ожидание выхода;
  повторный root Back в пределах renderer-defined интервала сворачивает
  приложение. Истечение интервала сбрасывает ожидание. Core определяет logical
  root и состояние history, а native adapter владеет таймером и platform-командой
  сворачивания.
- `Route.routes` первичной Route образуют её внутренний screen outlet.
  `ScreenRenderer` представляет переданную желаемую presentation, но не становится
  источником policy, params, pending, history либо runtime lifecycle.
- React Native projection для дочернего Router из `Route.routing` является
  Drawer/overlay отдельного frame presentation-layer поверх всей собранной
  цепочки application и Route Layouts, а не их content outlet и не Tabs.
  Frame не находится внутри screen stack, не наследует и не использует
  `Route.animation`. Его default presentation принадлежит `@Shell()`: после
  измерения собственной высоты frame появляется снизу вверх вместе с backdrop,
  а dismiss уводит его обратно вниз. Открытый Drawer входит в
  history snapshot как presentation вложенной Route: переход вперёд оставляет
  его activation retained, а Back восстанавливает Drawer открытым без fallback
  и loaders. Это не требует новых core Router classes, platform flags в
  `new Router()` или изменения application business logic.
  Present/dismiss/replace frame начинается по canonical pending projection до
  ожидания providers/loaders. Поздний bridge commit прикрепляет revision к той же
  physical operation: он не перезапускает анимацию и немедленно получает
  completion, если она уже достигла stable `visible`/`hidden`. До полного
  размонтирования уходящий frame остаётся modal input barrier: его children и
  dismiss-жест выключены, а жесты не проходят в нижний application screen.
- Native `ApplicationHost` создаёт `SafeAreaProvider` только как источник
  измерений и не оборачивает приложение в `SafeAreaView`, не добавляет padding
  либо margin автоматически. Native facade экспортирует
  `useSafeAreaInsets()`, возвращающий `{ top, right, bottom, left }`. Конкретный
  Layout, View или component сам выбирает необходимые стороны и место их
  применения. Поэтому safe-area может находиться внутри интерактивного элемента
  (например, внутри нижнего tab item), сохраняя его фон и hit area до физической
  границы экрана, а не становиться внешней полосой вокруг presentation.
- React Native `Screen` остаётся прозрачной physical presentation единицей: он
  владеет только mount/activity, z-order и transition. `Screen` не добавляет
  `ScrollView`, keyboard avoidance, safe-area padding либо pull-to-refresh.
  Структуру содержимого явно объявляет пользовательская view через `Viewport`.
  Один `Viewport` образует одну независимую content-coordinate system внутри
  конкретной presentation: ordinary screen, frame или modal.
- `Viewport` владеет одним вертикальным scroll owner и keyboard-aware поведением
  этого owner. Все его дочерние блоки равноправны: `Viewport.Slot` находится в
  основном потоке, `Viewport.Slot.Fixed` остаётся видимым и уменьшает доступную
  content-area, `Viewport.Slot.Sticky` сначала находится в потоке и затем
  использует нативное push-off sticky-поведение, `Viewport.Slot.Floating`
  рисуется поверх видимой области и не занимает места в layout. Для floating
  используются две независимые оси `vertical="top | center | bottom"` и
  `horizontal="start | center | end"`; значения по умолчанию — `top/start`, а
  визуальные отступы принадлежат внутренней view. Обычный Slot имеет естественную
  высоту содержимого; `grow` и `shrink` принимают `true` (вес `1`) либо числовой
  вес и по умолчанию равны `0`.
- Положение fixed-блоков определяется декларативным порядком: блоки перед
  scroll-flow образуют верхнюю fixed-area, блоки после него — нижнюю. В первой
  версии framework не вводит отдельный валидатор ошибочных комбинаций; реальные
  ограничения уточняются по проверенным сценариям.
- `Viewport.Collection` заменяет обычный scroll content одним виртуализированным
  вертикальным owner. Слоты до и после Collection остаются частью той же
  scroll-coordinate system, а не внешним вложенным `ScrollView`. Collection
  имеет декларативные `Collection.Item`, `Collection.Item.Sticky`,
  `Collection.Section`, `Collection.Empty` и `Collection.LoadMore`; публичный API
  не раскрывает `renderItem`/`renderSectionHeader` React Native. Горизонтальная
  коллекция внутри item/slot допустима и владеет только своей горизонтальной
  осью. Несколько вертикальных owners и вложенный `Viewport` в одной presentation
  не входят в поддерживаемую модель. Grid/table API отложен до отдельного
  реального сценария.
  Как и у React Native `VirtualizedList`, локальное состояние item за пределами
  render window не считается устойчивым: данные item принадлежат controller,
  form state либо другому внешнему владельцу, а не размонтируемой row view.
- `Collection.LoadMore` является end-observer, а не кнопкой и не владельцем
  pagination state. Он принимает внешний `inProcess` и `onLoad`; решение о
  наличии следующей страницы остаётся в controller. Вызов разрешён один раз при
  достижении конца новым пользовательским scroll-взаимодействием. Initial mount,
  изменение layout/content, завершение process и оставшаяся позиция у нижней
  границы не запускают каскадную подгрузку. Следующая попытка возможна только
  после выхода из end-zone и нового пользовательского достижения конца.
  Определение end-zone, его threshold и повторного достижения полностью
  делегируется `VirtualizedList.onEndReached`; adapter не вычисляет дистанцию до
  конца повторно и не выводит её из platform-specific порядка drag/momentum,
  `velocity` либо других scroll events. Его единственная защита поверх
  `VirtualizedList` — регистрировать `onEndReached` только после начала нового
  пользовательского scroll-взаимодействия и снимать его перед запуском
  `onLoad`. Initial callback нельзя принимать и отбрасывать внутри handler:
  `VirtualizedList` уже считает его доставленным для текущей длины content, из-за
  чего реальное достижение конца может не породить повторный callback. Во время
  текущего `inProcess` и до следующего пользовательского взаимодействия handler
  остаётся незарегистрированным.
  Дочерняя view `Collection.LoadMore` является overlay-accessory коллекции, а не
  item, footer либо частью её scroll-flow. При переходе `inProcess` в `true`
  accessory монтируется поверх нижней границы видимой области коллекции и
  анимированно выезжает снизу. После завершения operation он заезжает обратно и
  размонтируется только по завершении анимации скрытия. Анимация принадлежит
  presentation-механике `Collection.LoadMore`; `Viewport` предоставляет ей
  границы размещения с учётом нижней fixed-area. Появление и скрытие accessory не
  изменяет scroll offset, не зависит от drag/momentum и не резервирует место в
  содержимом списка. Без дочерней view `Collection.LoadMore` отображает штатный
  React Native `ActivityIndicator`; его цвет задаётся необязательным `color`.
  Переданная дочерняя view полностью заменяет штатный индикатор, при этом не
  получает владение trigger, process state, размещением или анимацией accessory.
  Её фактическая высота определяет амплитуду presentation-анимации.
- `useViewport().scrollToStart({ animated? })` является первым минимальным
  imperative-контрактом. Смена data сама по себе не управляет scroll position;
  retained смонтированный Viewport сохраняет нативный offset, а настоящий
  unmount/remount начинает с исходной позиции. `scrollToItem` не публикуется,
  пока framework не имеет общего контракта измерения virtualized items.
- Pull-to-refresh включается явно маркером `<Viewport.Refreshable />` и использует
  штатный React Native `RefreshControl`: framework не реализует собственный
  threshold, gesture-progress или таймер. `RefreshControl` подключается к тому же
  физическому scroll owner как для обычного потока, так и для Collection.
  Свойство `color` задаёт цвет системного индикатора и адаптируется в
  platform-specific `tintColor` на iOS и `colors` на Android. Произвольная
  дочерняя view не поддерживается: React Native не предоставляет единого
  кроссплатформенного контракта полной замены native pull-indicator без замены
  самого gesture/scroll owner. Framework не имитирует такую замену вторым
  overlay-индикатором, поскольку две несинхронные presentation-фазы дают
  непредсказуемое поведение пользователю.
  Индикатор отражает только revalidation, инициированную этим жестом: query,
  action, повторная навигация и другой источник общей revalidation не должны
  визуально изображаться как pull-to-refresh. Сама operation по-прежнему идёт
  через единую цепочку `RouteRuntime -> ModuleRuntime`.

  | Инициатор revalidation                         | Pull-to-refresh spinner                                    |
  | ---------------------------------------------- | ---------------------------------------------------------- |
  | pull-to-refresh gesture текущего Module screen | показывается до завершения инициированной жестом operation |
  | query transaction                              | не показывается                                            |
  | controller action или submit                   | не показывается                                            |
  | повторная навигация на active target           | не показывается                                            |
  | programmatic/global/targeted revalidation      | не показывается                                            |

  `RefreshControl.refreshing` не связывается с агрегированным
  `useRevalidate().inProcess`: это состояние отражает runtime operation независимо
  от инициатора и предназначено для общих или явно выбранных presentation-
  индикаторов. Viewport хранит presentation-состояние только собственного вызова
  и не реагирует на параллельную либо последующую operation другого инициатора.
  Распознавание жеста, достижение верхней границы и отмена принадлежат нативному
  `RefreshControl`; `refreshing` немедленно становится `true` только для принятого
  `onRefresh` и снимается после завершения вызванной Module revalidation.
  Один touch sequence находится ровно в одном режиме: scroll либо refresh.
  Режим выбирается в начале drag и не меняется до его завершения. Жест,
  начавшийся ниже верхней границы scroll owner, остаётся scroll, даже если в
  процессе достиг начала страницы; для refresh требуется следующий
  самостоятельный свайп вниз, начавшийся уже на верхней границе. Adapter не
  отбрасывает `onRefresh` на основании предполагаемого порядка JS scroll-events:
  распознавание принятого pull остаётся нативным. Там, где React Native
  предоставляет штатное управление доступностью RefreshControl, adapter
  запрещает его для жеста, начавшегося вне верхней границы, и снова разрешает
  только после завершения этого scroll. Собственный pull threshold, pan
  recognizer и таймер не вводятся.
  Такое устройство следует контрактам React Native
  [`RefreshControl`](https://reactnative.dev/docs/refreshcontrol) и
  [`VirtualizedList`](https://reactnative.dev/docs/virtualizedlist): pull
  распознаётся вертикальным scroll owner на верхней границе, а `refreshing`
  остаётся controlled-состоянием инициировавшей его presentation.

- Работа с экранной клавиатурой является ответственностью React Native adapter,
  а не core, Module/controller либо прикладной формы. Framework не хранит
  значение полей, не связывается с `react-hook-form` и не добавляет собственную
  focus-навигацию: `TextInput`, IME и submit сохраняют нативную platform-
  семантику. `Viewport` предоставляет keyboard-aware presentation для своего
  физического scroll owner и разрешает конфликты с framework-жестами.
- Native renderer создаёт один стабильный `KeyboardSurface` над полным деревом
  presentation: application, frame, modal и notification. Он является единым
  источником native keyboard/focused-input events и не размонтируется при смене
  presentation process. Создавать вложенный `KeyboardSurface` для frame либо
  React Native `Modal` запрещено: конкурирующие `KeyboardProvider` нарушают
  порядок keyboard events и теряют ownership focus при возврате между native
  windows.
- Application, Frame и Modal остаются независимыми presentation processes и
  получают собственный `Viewport`/keyboard-aware scroll owner. Поддерживаемый primitive
  сопоставляет focused input с владельцем по native parent ScrollView target,
  поэтому keyboard geometry применяет только соответствующий scroll container.
  `KeyboardSurface` не заменяет native `Modal`, не переносит overlays под
  application Layout и не ослабляет их modality либо z-order.
  Для Frame единственный `Viewport` объявляется view вложенного Module. Пользовательская
  `@Shell()` view отвечает только за внешнюю surface/chrome (например, фон,
  скругление и grabber), размещает `children` напрямую и не создаёт второй
  scroll owner вокруг Module. Благодаря `ShellRuntimeContext` тот же `Viewport`
  автоматически использует shell-aware scroll primitive и сообщает ShellHost
  границы и offset, необходимые жесту закрытия.
- Viewport ordinary Module presentation сохраняет текущий сфокусированный `TextInput` и
  caret видимыми над клавиатурой средствами поддерживаемого keyboard-aware scroll
  primitive. Нижняя `Viewport.Slot.Fixed` использует штатную композицию
  `KeyboardAwareScrollView + KeyboardStickyView`: fixed-area следует за нативной
  анимацией клавиатуры, а её измеренная высота входит в `bottomOffset` scroll owner,
  поэтому focused input не оказывается под controls. Весь `Viewport` не оборачивается
  дополнительным `KeyboardAvoidingView`: это повторно применило бы keyboard geometry
  к уже keyboard-aware scroll owner. Такая композиция повторяет
  [официальный пример библиотеки](https://github.com/kirillzyusko/react-native-keyboard-controller/blob/main/example/src/screens/Examples/AwareScrollViewStickyFooter/index.tsx).
  Frame использует другую композицию: его
  presentation-контейнер целиком поднимает surface и ограничивает её доступной
  над IME областью, а `Viewport` отвечает только за внутреннее
  переполнение уже расположенного frame и сохраняет focused input видимым внутри
  этой доступной области. `ShellHost` является единственным владельцем keyboard
  geometry frame; shell-aware scroll не применяет высоту клавиатуры повторно.
  `ShellHost` сам не прокручивает content и не измеряет положение input. Ручные
  измерения координат, `setTimeout` для
  focus/scroll и прикладные keyboard spacers в Module views не являются
  framework contract. Tap по доступному form control обрабатывается с первого
  нажатия; keyboard dismiss следует нативному режиму платформы (`interactive` на
  iOS, `on-drag` на Android).
- Пользовательская presentation, создающая отдельную content surface (включая
  Prompt в React Native `Modal`), объявляет собственный `Viewport`, но не создаёт
  `KeyboardSurface`: она наследует единый keyboard runtime application host.
  Физический modal host, как и frame host, применяет `KeyboardAvoidingView` к
  presentation целиком: клавиатура уменьшает доступную область модалки, а её
  `Viewport` прокручивает длинное содержимое и сохраняет focused input видимым.
- Деактивация screen снимает текущий native input focus. Native adapter не хранит
  последний вручную сфокусированный input и не восстанавливает его либо
  клавиатуру при повторной активации presentation. Клавиатура после активации
  появляется только у явно объявленного screen autofocus; без autofocus поле
  остаётся несфокусированным до пользовательского действия. Универсальный
  `useScreenAutoFocus` связывает focusable ref с activity screen и одинаково
  применим к обычному `TextInput`, полям формы и пользовательским input-
  компонентам. Keyboard-aware scroll owner не выбирает focus: после подтверждения
  показа native keyboard сам поддерживаемый `KeyboardAwareScrollView` доводит
  focused input до видимой области. Framework hook только применяет `focus()` к
  явно autofocus-полю активного screen. При переходе keyboard-aware owner из
  inactive в active adapter один раз вызывает публичный
  `assureFocusedInputVisible()`: это синхронизирует уже начавшийся native focus/
  keyboard process с вновь активированной presentation, но не реализует
  собственный scroll algorithm. Механизм не требует таймеров, сохранения input
  identity, `findNodeHandle`, ручного измерения координат или логики конкретной
  формы.
  Интеграция virtualized owner выполняется штатным для
  [`react-native-keyboard-controller`](https://kirillzyusko.github.io/react-native-keyboard-controller/docs/api/components/keyboard-aware-scroll-view#flatlistflashlistsectionlist-etc)
  способом через `renderScrollComponent`; framework не реализует собственный
  алгоритм измерения либо прокрутки focused input.
- Keyboard-aware primitives активны только в focused presentation согласно
  `ScreenActivityContext`. Retained screen, underlying application под frame и
  application под native Modal остаются смонтированными, но не сдвигают свои
  fixed/floating areas вслед за клавиатурой другой presentation.
- Жест, начавшийся при видимой клавиатуре, не может в ходе того же touch sequence
  превратиться в pull-to-refresh или dismiss frame. В Module он только завершает
  нативное взаимодействие с клавиатурой; revalidation разрешается следующим
  жестом, начатым после её скрытия на верхней границе. В Shell первый свайп вниз
  скрывает клавиатуру и сохраняет frame; только следующий самостоятельный свайп
  может участвовать в scroll/dismiss contract. Это правило действует для всей
  shell gesture surface, а не только для координат `ShellScrollView`.

- Module внутри Drawer/frame не получает pull-to-refresh от native Module host.
  Высота frame определяется его presentation content, пока тот помещается в
  доступную safe-area. При превышении доступной высоты frame упирается в
  maximum height, а выбранная Shell view внутренняя область становится
  scrollable. Вертикальный жест этой presentation принадлежит `@Shell`:
  renderer двигает frame вслед за пальцем и после завершения commit-анимации
  вызывает scoped `close()`; при отмене возвращает frame на место. Core удаляет
  текущую nested entry и её runtime, восстанавливая owner entry, либо заменяет
  только текущую entry при direct link. Операция не вызывает `back()` и поэтому
  не может перейти в root-back/exit flow. Непрерывный gesture progress является
  renderer state и не публикуется в core.

  Frame presentation владеет собственным автоматом `presenting | visible |
dismissing | hidden`. Источник logical close ему неизвестен: scoped
  `navigate.close()` из controller/view, `useShell().close()`, platform Back и
  завершённый dismiss-жест приводят к одному целевому состоянию `hidden`.
  После core commit native adapter удерживает уже показанный nested runtime в
  presentation-slot до завершения exit animation frame и backdrop; только после
  этого renderer bridge завершает presentation-cycle, а core штатно освобождает
  activation. Поэтому navigation API не запускает animation, не ожидает таймер и
  не содержит отдельных путей для кнопки, Back или жеста.

  Один bridge commit имеет единый presentation-cycle. Если одновременно меняются
  основной screen и frame layer, commit завершается после готовности обоих
  независимых presentation owners. Замена shell на том же уровне выполняется как
  `dismiss old -> present new`; вложенный shell завершает только transition своего
  уровня. Настройка animation обычного Route не наследуется Frame и не протекает
  в дочерние Router. Frame всегда использует собственную shell presentation.

  Scroll и dismiss образуют один coordinated gesture contract. Пока внутренний
  scroll offset больше нуля, свайп вниз принадлежит scrollable content. После
  достижения верхней границы продолжение того же свайпа может активировать
  interactive dismiss без скачка frame. Если content уже находится сверху либо
  не требует scroll, свайп вниз сразу принадлежит shell. Свайп вверх не
  активирует dismiss. Gesture detector занимает весь shell layer, включая
  backdrop: свайп вниз можно начать в любой точке экрана. Ограничение по scroll
  offset применяется только к жесту, начатому внутри `ShellScrollView`; жест вне
  scrollable области сразу управляет shell. Scroll и shell не изменяют
  presentation одновременно. Dismiss recognizer декларативно включён только в
  фазе `visible`; переходы `presenting | dismissing | hidden` обновляют его native
  configuration через renderer lifecycle. `SharedValue` хранит только
  непрерывные gesture/animation coordinates и не подменяет lifecycle-состояние
  доступности recognizer.

  ```tsx
  const DrawerBackdrop = () => <Blur />;

  @Shell({ backdrop: DrawerBackdrop, view: DrawerView })
  export class DrawerShell extends ShellInterface {}
  ```

  Native `ShellView` получает `children` и описывает пользовательский chrome.
  Необязательный `backdrop` является отдельной renderer-specific view и
  определяет только внешний вид слоя позади frame: цвет, blur, gradient либо
  прозрачность. Он не создаёт собственную модальность, gesture runtime или
  lifecycle.
  Она выбирает место внутреннего scrollable content через framework primitive
  `ShellScrollView`, а через `useShell()` может запросить явный scoped `close()`,
  например из собственного header. Эти API не передают view пороги, gesture
  state, animation callbacks или navigation runtime. Размещение и анимацию
  backdrop, измерение и ограничение frame, scroll/dismiss arbitration, interactive pan,
  displacement, dismiss/cancel animation и фактический scoped `close()`
  реализует единый native Shell host. `useShell().close()` только запрашивает ту
  же scoped `navigate.close()` и не управляет физической анимацией. Полный shell
  layer блокирует взаимодействие с owner screen независимо от визуального
  содержимого backdrop; tap по backdrop не закрывает frame. Dismiss
  запускается ровно один раз; после core commit nested host целиком
  размонтируется вместе с backdrop, gesture layer и Shell view. Прикладной
  shell не создаёт собственный gesture state и не вызывает navigation по
  окончании жеста.

- В режиме `retain`, пока history entry ссылается на activation, core сохраняет её подготовленное
  Route/Module состояние, controller и provider instances. Несколько history
  entries могут ссылаться на одну activation; это не создаёт новый Route runtime.
  Потеря focus, переключение tab или push следующего screen сами по себе не
  вызывают dispose. Возврат к retained entry переиспользует те же instances.
- Retained activation удаляется, когда после pop/reset её больше не удерживает ни
  одна history entry, а также при удалении её Route-ветки вследствие
  session/access transition либо dispose Application. Переход
  `retained -> focused` сразу возвращает сохранённую
  presentation без initial fallback, application splash, повторного loader или
  автоматической revalidation. Потеря и восстановление focus сами по себе не
  являются runtime operation. Обновление запускается только явным вызовом
  revalidation, включая пользовательский pull-to-refresh, повторную активацию
  уже active target с `revalidate: true` или query transaction с
  `revalidate: true`. Во время такой operation текущие loader data остаются
  видимыми, а process и recoverable error публикуются через обычный observable
  revalidation state и подчиняются общему operation/revision coordinator.
- До commit ещё не посещённая цель не становится history activation: core
  публикует pending branch transition, а committed activation остаётся
  `focused`. Native renderer создаёт для candidate временную physical
  presentation и показывает fallback внутри её boundary, не создавая фиктивную
  core history entry. После успешного commit core создаёт activation и фиксирует
  history mutation атомарно, а renderer сохраняет уже показанный screen и только
  связывает его с committed entry. Back во время подготовки отменяет transaction,
  удаляет pending screen обратным physical transition и открывает уже
  смонтированную committed presentation без fallback, loader или revalidation.
- Identity activation определяется Route path и params после разрешения
  default/index/policy branch. Query и transient state в identity не входят: их
  изменение остаётся navigation/revalidation того же screen. Новые params
  подготавливают новую activation тем же Route runtime; ранее подготовленная
  activation остаётся retained, пока на неё ссылается history.
- Обычный `navigate.to(..., { replace: true })` заменяет только текущую logical
  history entry и соответствующую physical navigator entry. Более ранняя
  доступная entry остаётся Back target. Полностью очищает retained registry core
  и physical navigator history только session branch transition: недоступная
  предыдущая policy-ветка не остаётся Back target, а на корне новой ветки
  действует обычное root Back поведение renderer.
- Изменение `SessionRuntimeState.phase` после первой committed navigation является
  session boundary и запускает fresh transition независимо от совпадения Route и
  params. Core не фокусирует retained activation и не переиспользует текущий
  Route/Module/controller runtime: новая policy-ветка полностью подготавливается
  поверх committed presentation, после commit history сбрасывается одной
  mutation, а все activations предыдущей сессии освобождаются. Поэтому это
  поведение одинаково для `retain` и `release` и не зависит от renderer либо от
  наличия `replace: true` в прикладной policy.
- `session.expire()` и явный `session.setAnonymous()` имеют разную recovery-
  семантику. Expiration после `401` разрешает policy сохранить текущую logical
  location и после новой авторизации восстановить её как fresh activation.
  Явный переход `authenticated -> anonymous` очищает сохранённую location и не
  позволяет auth-policy заново сохранить покидаемый Route; следующая
  авторизация открывает первый доступный Route как новую ветку.
- Обычный UI Tabs, сохраняющий выбор в query, Router не является.
- Visibility и renderer freeze принадлежат renderer host. Focus является core
  activation state: renderer получает его как snapshot и не вычисляет по своему
  tab/stack дереву. Core не реализует platform rendering effect.
- Logical Route/Router ownership не предписывает DOM/native view nesting. В
  текущем web adapter Router host размещает вложенную presentation через
  frame shell, а frame layer остаётся глобальным overlay и не становится
  дочерним DOM-узлом Module view или ordinary Route layout только из-за DI-
  ancestry. В React Native navigator host непосредственно размещает Module как
  screen; отдельный shell или portal между Route и Module не создаётся.
- Публичный Router `id` для этого не вводится: глобально уникальный route token
  однозначно определяет Route и владеющий ею Router. Внутренняя object identity
  Router остаётся implementation detail.
- Вызов навигации всегда направлен на Route. Разработчик не открывает, не
  закрывает и не выбирает Router вручную.
- Открытие вложенной Route выполняется тем же `navigate.to(RouteToken, ...)`,
  что и любой другой переход; отдельный `frame.open()` в целевом API не нужен.
- Текущая возможность закрыть frame из controller должна сохраниться как
  renderer-neutral scoped navigation operation: она деактивирует Router scope
  текущей вложенной Route и сохраняет неизвестную controller-у основную ветку
  владельца. Это необходимо и при direct link, где `back()` не является
  эквивалентом close. Публичная операция называется
  `navigate.close()`; она использует scope вызывающего runtime и не
  требует от controller знания Route-владельца либо transport address.
- `navigate.frame.close()` в целевой API отсутствует и не образует отдельную
  frame-navigation механику. Consumers переводятся на `navigate.close()`.
- `close` в renderer shell вызывает ту же scoped operation, а не отдельный
  renderer lifecycle. Операция удаляет текущую nested history entry, освобождает
  её activation и не создаёт parent entry. Если соответствующая owner entry уже
  есть в history, она восстанавливается без loader/fallback; при direct link core
  заменяет только текущую entry подготовленным owner state.
- `back()` остаётся bridge-backed history traversal. Framework не выводит для
  него синтетического родителя из route declarations, если transport не имеет
  предыдущего состояния.
- Ядро находит целевую Route в общем scoped tree, сохраняет незатронутые Router
  scopes, подготавливает новые ветки и коммитит одну navigation transaction.
- Переход на родительскую Route закрывает вложенную ветку без пересоздания и без
  автоматической revalidate родительского runtime.
- Переход между sibling Routes заменяет только дочерний runtime; родительский
  runtime остаётся живым.
- Переход в Route другого scope или другой основной ветки вычисляет и
  подготавливает весь необходимый target graph. Ошибка подготовки не должна
  уничтожать текущий committed state.

Минимальная согласованная связь:

```ts
export class TerminalsRoute {}

export class TerminalReviewRoute {
  readonly id: number;
}

export class TerminalEditRoute {}

const ApplicationRouter = new Router({
  routes: [
    new Route({
      token: TerminalsRoute,
      address: segments('terminals'),
      load: () => import('@module/terminals'),
      routing: [
        new Router({
          routes: [
            new Route({
              token: TerminalReviewRoute,
              address: segments('terminals', param('id')),
              routes: [
                new Route({
                  load: () => import('@module/terminal-review'),
                }),
                new Route({
                  token: TerminalEditRoute,
                  address: segments('edit'),
                  load: () => import('@module/terminal-edit'),
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ],
});
```

Каждая Route объявляет только принадлежащую ей часть address внутри своего
Router scope. В примере root scope имеет address `terminals`, а дочерний scope —
`terminals/:id/edit`. Это два scoped logical addresses, а не одна строка
`terminals/terminals/:id/edit`. Web bridge может спроецировать их соответственно
в pathname и hash.

### 7. Универсальная Route и address

- Полный набор полей целевой Route закрыт следующим контрактом; дополнительные
  обязательные поля при реализации не вводятся:

```ts
new Route({
  token: SomeRoute, // optional
  address: segments(...), // optional

  canMatch: [],
  canActivate: [],
  canAction: [],

  defaultTo: SomeChildRoute, // или Router.firstAvailable()

  layouts: [],
  providers: [],

  fallback,
  exception,
  forbidden,
  notFound,

  routing: [],

  // load и routes взаимоисключающие и оба optional,
  // если непустой routing является единственным содержимым Route:
  load: () => import(...),
  // routes: [],
});
```

- `path` текущего web API заменяется на universal `address`, `frames` — на
  `routing`, а `baseUrl` принадлежит web bridge. Остальные поля и их
  ответственность не переносятся из Route.
- `load` и `routes` взаимоисключающие. Route обязана определить хотя бы один из
  `load`, непустого `routes` или непустого `routing`; `routing` ортогонален
  первым двум вариантам и может быть единственным содержимым Route.
- Routing-only Route является полноценной boundary для policies, providers,
  layouts, params и дочерних Router, но не создаёт фиктивный ModuleRuntime. Это
  позволяет описывать, например, authenticated navigation host или native tabs
  host без пустого package с `@Module`.
- `routes` не может быть пустым. `defaultTo` допустим только у Route с
  `routes` и не может одновременно использоваться с дочерней index Route.
- Текущий explicit default сохраняется без transport-строки:
  `defaultTo: ChildRouteToken`. Token обязан указывать на достижимого потомка
  этой branch Route внутри того же Router scope. Попадание точно в address
  группы запускает replace-переход к target с обычными policies.
- `Router.firstAvailable()` остаётся автоматическим вариантом default. Он не
  требует target token и выбирает первый доступный child по порядку декларации.
- Отсутствие `address` у leaf Route означает index Route; отсутствие `address`
  у branch Route означает транзитную structural Route.
- Пустой `segments()` запрещён: для index или structural Route свойство
  `address` не задаётся.
- Среди sibling Routes может быть только одна index Route; одинаковые sibling
  address declarations запрещены. Имена dynamic params не нормализуются в
  выдуманную общую matcher shape; дополнительный анализ потенциальных коллизий
  сверх обычных правил resolver не вводится. Несколько tokenless structural
  Routes без `address` остаются допустимыми.
- `routing` принимает только экземпляры `Router`.
- `canMatch`, `canActivate`, `canAction`, `providers` и routing structure
  типизируются core. `layouts`, `fallback`, `exception`, `forbidden`,
  `notFound` и результат `load` типизирует renderer adapter, не меняя их
  framework lifecycle.
- У Route, которая является целью программной навигации, class token задаёт
  стабильную логическую identity и контракт params.
- Structural Route, которая служит только внутренней boundary для policies,
  layouts, providers и дочерних routes, не обязана иметь `token`.
- Branch/structural Route может иметь token, если она является публичной целью
  или navigation anchor и владеет, например, dynamic params. Переход на такой
  token разрешает её index/default child; если завершить адрес через
  index/default невозможно, target считается неполным и отклоняется до
  policies и prepare.
- `new Route({ token: RouteClass, ...options })` связывает optional class token
  с узлом route tree; созданный объект нужен только application composition.
- Отдельный строковый `id` не требуется.
- Один class token может быть зарегистрирован только у одной Route во всём
  Application. Повторная регистрация того же class token является ошибкой
  bootstrap, даже если Routes находятся в разных или взаимоисключающих ветках.
- Разрешение token не зависит от текущей активной ветки: он однозначно указывает
  на зарегистрированную Route. Разные публичные navigation targets используют
  разные token classes, но могут переиспользовать один и тот же `load()` или
  прикладную реализацию.
- Core не задаёт физическое размещение, package ownership или обязательный
  facade для route token. Token может быть объявлен рядом с модулем либо в
  отдельном пакете routes; выбор является решением приложения.
- Для framework значимо только, что регистрация Route и вызывающий код используют
  один и тот же class object. Организация entrypoints и сохранение нужной
  приложению lazy boundary не являются отдельной семантикой Router.
- Route имеет нейтральный структурированный address.
- В универсальном контракте нельзя использовать `window.location`, hash,
  React Router path objects или native screen names.
- Address задаётся нейтральными segments; bridge отображает его в собственный
  transport.
- `param()` сохраняет literal-имя параметра в phantom generic address, а
  `segments()` сохраняет полный набор имён параметров составного address.
- Для Route с class token TypeScript обязан проверять точное совпадение имён
  public data fields `InstanceType<typeof RouteToken>` и параметров собственного
  address. Отсутствующее или лишнее имя является compile-time error;
  родительские params и query в сравнение не входят.
- Сравнение ограничено именами. Типы значений полей route token не
  ограничиваются `string` или закрытым набором primitives и используются для
  типизации входа `navigate`.
- `segments()` используется только для декларации address Route и не является
  navigation helper. Отдельной публичной функции `segment()` нет.
- Одиночная форма `navigate.to(RouteToken, options)` является основным API.
  Поле `options.params` точно типизируется через
  `InstanceType<typeof RouteToken>` и не принимает params чужих Route.
- Одиночная форма может переиспользовать уже committed params активных
  родительских Route. Если для перехода требуется param неактивного родителя,
  которого нет в контракте целевого token, переход отклоняется до `policies` и
  `prepare`; неявного поиска такого значения нет.
- Для атомарного перехода через неактивные параметризованные родительские Route
  используется fluent-форма `navigate.through(...).to(...)`. Каждый
  `through(RouteToken, { params })` связывает только локальные params указанной
  родительской Route; terminal `to(RouteToken, options)` всегда и только задаёт
  конечную цель и её локальные params.
- `through()` не начинает navigation operation и не меняет committed state.
  Ровно одна navigation transaction создаётся только terminal-вызовом `to()`.
  `replace`, `query`, `state` и `revalidate` допустимы только в options
  terminal `to()`; options `through()` содержат только точные локальные
  `params` соответствующего token.
- При переходе в nested Router уже committed Route-ветка внешнего Router
  является контекстом конечной цели, а не частью изменяемой target-ветки.
  Поэтому `through()` для её активного параметризованного предка только
  проверяет совпадение переданных params с committed params и не включает этот
  Route в transition plan. Несовпадение является configuration error до
  `policies`, `prepare`, loaders и публикации fallback; для смены внешней ветки
  приложение выполняет отдельный явный `navigate.to()`.
- Если требуемая внешняя ветка ещё не активна, terminal `to()` создаёт одну
  общую transaction и использует её `through()` bindings для построения
  недостающей ancestry. Таким образом lifecycle всегда вызван конечной целью
  `to()`, а не самим параметризатором `through()`.
- Pending state и fallback принадлежат только Router-веткам, которые реально
  меняются terminal-переходом. Проверочный `through()` активного внешнего
  контекста не ревалидирует и не переводит его Module в pending.
- Одинаковые имена params у разных Route допустимы, потому что значения остаются
  в разных вызовах и не объединяются в плоский объект. Target не выводится из
  позиции в массиве: token в `to()` остаётся целью независимо от количества
  предшествующих `through()`.
- В fluent-цепочке не перечисляются tokenless structural Routes, layouts,
  Routers и параметрически нейтральные промежуточные Route. Ядро восстанавливает
  scoped ancestry между anchors, проверяет, что `through` tokens являются
  строгими предками target в одном достижимом пути и перечислены в порядке от
  родителя к потомку, после чего выполняет одну navigation transaction.
- Повтор token, включение target в `through()`, sibling/descendant anchor либо
  неверный порядок являются configuration error до `policies` и `prepare`.
- Изменение только tokenless structural nesting, layout nesting или внутренней
  структуры Router не должно ломать navigation call. Изменение публичной
  параметризованной anchor Route или владельца param является изменением
  navigation contract.
- Одиночная форма выглядит так:

```ts
export class ReportRoute {
  readonly reportId: number;
}

await navigate.to(ReportRoute, {
  params: { reportId: 42 },
});
```

- Одиночный token не разрешает передать params родительской Route. Для
  абсолютного перехода из другой ветки недостающий параметризованный предок
  задаётся через `through()`, а цель остаётся явно видна в `to()`:

```ts
export class OneRoute {
  readonly id: string;
}

export class TwiseRoute {
  readonly id: string;
}

await navigate
  .through(OneRoute, {
    params: { id: oneId },
  })
  .to(TwiseRoute, {
    params: { id: twiseId },
  });
```

- Fluent API доступен у того же scoped `NavigateServiceInterface` и renderer
  hook, не создаёт отдельную Route declaration, navigation token или публичную
  identity. Конкретная TypeScript-реализация не должна ослаблять exact params
  contract или заставлять разработчика передавать structural routes.
- Runtime-проверка может дублировать этот invariant для JavaScript и unsafe
  casts, но не заменяет compile-time связь token и address.
- Branch Route сохраняет автоматический default-механизм
  `defaultTo: Router.firstAvailable()`.
- `Router.firstAvailable()` обходит дочерние routes в порядке декларации,
  проверяет их `canMatch`, включая отсекающие access policies, рекурсивно ищет
  первый доступный конечный route, выполняет replace-переход и возвращает
  `forbidden`, если доступной ветки нет.
- Для этого механизма разработчик не задаёт строковый path или class token
  целевого Route.
- Пример согласованной формы логического адреса:

```ts
export class UserEditRoute {
  readonly userId: string;
}

new Route({
  token: UserEditRoute,
  address: segments('users', param('userId'), 'edit'),
  load: () => import('@module/user-edit'),
});
```

- Web bridge может отобразить этот address в URL.
- React Native bridge может отобразить его в navigation state или screen.
- FSM bridge может отобразить его в state/event transition, даже если там нет
  понятия URL или query string.

### 8. Navigation pipeline и bridge authority

- Вызов `navigate`, browser Back/Forward, deep link, native tab press или FSM
  event поступает в один pipeline как запрос на переход. Отдельная публичная
  декларация или прикладной контракт `NavigationIntent` не вводится.
- Единственный pipeline ядра:

```text
request -> resolve -> blockers -> policies -> prepare -> commit | abort
```

- Ядро является источником истины для committed logical navigation state.
- Ядро также владеет history cursor, порядком entries, их `push`/`replace`/`pop`,
  activation identity и состояниями `preparing`/`focused`/`retained`.
- Bridge объявляет один неизменяемый для Application режим
  `runtimeRetention: 'retain' | 'release'`. Core, а не bridge, реализует обе
  lifecycle-ветки, освобождение runtime, fresh activation при Back и retained
  focus. React web bridge выбирает `release`, React Native bridge — `retain`.
- Bridge владеет физическим transport, внешними событиями и кодированием.
  Renderer владеет только platform presentation: native screen hierarchy,
  retained views, gestures и animation state. Web bridge может хранить Browser
  History; native screen renderer не создаёт параллельную navigation history.
- Commit core передаёт bridge готовые history action, entry id и logical
  location. Возвращаемый bridge promise означает завершение соответствующей
  физической presentation; до него core сохраняет удалённые history mutation
  activations доступными renderer. Bridge не выводит logical данные из URL, tab
  state или собственного stack и не освобождает runtime самостоятельно.
- Внешний transport event передаёт core location и известный entry id; core
  восстанавливает retained activation в `retain` либо подготавливает новую в
  `release`.
- Физическое состояние renderer является производной проекцией и не становится
  вторым источником logical navigation state. Adapter заново разрешает желаемую
  presentation из authoritative core state, а screen renderer только отображает
  её. Он не выполняет logical navigation commands, не кеширует
  Router history и не восстанавливает её самостоятельно. Bridge не определяет
  activation identity и не управляет lifecycle отдельных runtime: он выбирает
  только общий retention mode при создании Application.
- Direct link и Back/Forward проходят тот же pipeline, что программный вызов.

#### Navigation blocker

- Существующая блокировка ухода сохраняется как часть core navigation pipeline,
  а не как особенность React Router.
- После resolve core знает current и target runtime graph и проверяет только
  registrations тех Route boundaries, которые операция действительно покидает.
  Query-only update не считается уходом с Route boundary. Если переход к
  дочерней `Route.routes` заменяет terminal Module родительской Route новым
  screen, родительская boundary считается покидаемой, даже когда её runtime
  остаётся общей ancestry нового route path. Открытие `Route.routing` как frame
  поверх остающегося owner screen родительскую boundary не покидает.
- Несколько условий одной boundary объединяются через `OR`. Scoped `allow()`
  разрешает ровно один переход, инициированный владельцем, и не обходит
  blockers других покидаемых boundaries.
- Core хранит registrations, pending decision и `leave`/`stay` control. Bridge
  отвечает за удержание или отмену физического transition: browser
  Back/Forward, push/replace, native navigation либо FSM command.
- Presentation и view hook принадлежат renderer adapter; controller-level
  `NavigationBlockerServiceInterface` остаётся core contract.
- Web bridge сохраняет pre-commit interception при наличии Navigation API,
  функциональный history fallback и нативный `beforeunload` для закрытия или
  перезагрузки вкладки.

#### Policy pipeline

- Core, а не renderer adapter, собирает и выполняет policies target boundary
  path `Router -> Route -> nested Router -> nested Route` для затронутых scopes.
- Во время resolve `canMatch` выполняются parent-to-child внутри выбираемых
  Route-веток и Router scopes. После выбора target graph `canActivate`
  выполняются в том же порядке. Уже committed незатронутые boundaries не
  активируются повторно только из-за изменения дочернего scope.
- Action повторно проверяет `canMatch` всех активных Router/Route boundaries,
  затем выполняет `canAction` активных Route boundaries root-to-leaf. У Router
  поля `canAction` нет.
- Первая failure в обычном target pipeline прекращает операцию; runtime
  применяет configured `PolicyBoundaryDecision` этой failure.
- `Router.firstAvailable()` проверяет `canMatch` кандидатов в том же порядке и
  пропускает недоступные ветки. Failure при таком probing означает только, что
  кандидат недоступен: redirect/forbidden handler отвергнутого кандидата не
  заменяет автоматический поиск следующего Route.
- Policy aggregation и execution удаляются из React route-object builder и не
  дублируются renderer bridge.

#### Policy redirect

- `Router.redirectTo()` не является универсальным navigation API и не входит в
  `NavigateServiceInterface`.
- Это синхронная фабрика `PolicyBoundaryDecision`, используемая только в
  обработчиках результата policy boundary: `onPass`, `onFail` или `onError`.
- Helper сам не выполняет переход и не возвращает navigation promise. Решение
  интерпретирует runtime Router внутри текущего policy/navigation pipeline.
- Цель policy redirect задаётся class token, а не transport-specific строкой:

```ts
RequireAuthenticatedSessionPolicy.configure().onFail(
  Router.redirectTo(SignInRoute, {
    replace: true,
    saveCurrentLocation: true,
  }),
);
```

- Существующие policy options `replace` и `saveCurrentLocation` сохраняются.
  `Router.redirectToSaved({ replace: true })` сохраняет replace-семантику;
  удаляются только ранее отклонённые публичные `key` и `fallback`.

- Policy redirect принимает только одиночный route token и может переиспользовать
  committed params его активных предков. Fluent `navigate.through()` не входит
  в policy boundary contract; redirect к target, которому требуются params
  неактивного предка, является configuration error. Policy для такого сценария
  должна направлять на стабильную entry Route, разрешимую без отдельной цепочки.
- Этот контракт не превращает `Router.redirectTo()` в alias для
  `navigate.to()`. Policy redirect принимает только точные `params` logical
  target, `replace` и `saveCurrentLocation`. `query`, `state`, `merge` и
  `revalidate` остаются контрактом обычной navigation operation и не входят в
  policy boundary decision.
- Публичного `key` для navigation continuation в целевом контракте нет.
  Framework хранит не более одного ожидающего logical location возврата в
  текущем navigation context: новый capture заменяет предыдущий, а
  `Router.redirectToSaved()` однократно consume-ит сохранённое значение.
- Публичного `fallback` у `Router.redirectToSaved()` также нет. Если сохранённая
  logical location отсутствует, Router запускает обычное разрешение начальной
  ветки Application; существующий `defaultTo: Router.firstAvailable()` выбирает
  первый доступный Route и применяет его `canMatch`.
- Текущий web fallback `'/'` не преобразуется в route token. Это transport-
  представление входа в корень route tree: root Router и промежуточные
  tokenless structural Routes остаются допустимыми и участвуют в policies,
  layouts, providers и выборе `firstAvailable()`.
- В core возврат к корню является внутренним root-resolution intent, а не
  публичной именованной Route и не требованием добавить token транзитному
  Router или Route.
- Если policy должна направить на конкретную Route, она возвращает
  `Router.redirectTo(RouteToken)`. Для автоматического fallback token не
  создаётся и не передаётся.

#### Navigation surfaces

- Core `NavigateServiceInterface` принимает одиночный route token напрямую либо
  собирает недостающие параметризованные anchors через
  `navigate.through(...).to(...)` и управляет общей navigation transaction.
  Renderer hooks получают тот же scoped service, а не отдельную реализацию
  переходов.
- Imperative `navigate` и renderer-specific Link/NavItem не создают разные
  модели перехода: оба собирают один внутренний core navigation request с явно
  заданным target token, его локальными params, ordered `through` bindings и
  terminal options. Этот request не является публичным Route target или второй
  declaration. Конкретную декларативную форму control props задаёт adapter, но
  она не может объединять scoped params в плоский объект либо выводить target из
  позиции token. React adapter сохраняет active/pending state и optional
  `viewTransition`; React Native отображает тот же logical request своими
  platform controls.
- Shareable `href` является capability web bridge: bridge кодирует scoped
  logical location в pathname/search/hash. Core route declaration и controller
  не собирают URL вручную.
- React adapter разделяет два headless control-контракта. `NavItem` является
  универсальным контролируемым навигатором и передаёт render delegate только
  `execute`, `isActive` и `isPending`. `NavLink` специализируется на нативной
  ссылке и передаёт delegate объект `anchor` с готовыми `href`, `onClick` и
  `aria-current`, а также те же active/pending состояния. Ни один из них не
  создаёт DOM и не знает о компонентах `@tiyn/kit`; конкретный `<a>`, Button или
  визуальный компонент выбирает consumer.
- Оба React control принимают одну декларацию
  `navigation={(navigate) => navigate.through(...).to(...)}`. Terminal `to()`
  явно задаёт target, а `through()` только связывает params строгих предков.
  `NavLink` перехватывает через `anchor.onClick` только обычный primary click;
  modified click, `target`, `download` и отменённое consumer-событие сохраняют
  нативное поведение браузера.
- Active state `NavItem`/`NavLink` определяется принадлежностью target Route
  committed active branch, а не только точным совпадением конечного URL. Поэтому
  пункт основного Module остаётся active при открытой вложенной Route этого
  Module.
- Повторная активация уже active target не подавляется renderer control. Она
  проходит через тот же navigation pipeline и при `revalidate: true` запускает
  revalidation полной сохранённой active branch без пересоздания runtime. Это
  одинаково для imperative navigation, `NavItem`, `NavLink` и consumer links.

```tsx
<NavLink
  navigation={(navigate) =>
    navigate.through(OneRoute, { params: { id: oneId } }).to(TwiseRoute, { params: { id: twiseId } })
  }
>
  {({ anchor, isActive, isPending }) => (
    <a {...anchor}>
      <MenuItem isActive={isActive} isPending={isPending} />
    </a>
  )}
</NavLink>
```

- Application-level exception/forbidden/notFound views должны сохранить
  текущую возможность перейти в root resolution с `replace: true`. Root Router
  и его tokenless boundaries остаются допустимыми, поэтому заставлять такой UI
  знать token первого доступного Route нельзя. Публичная операция называется
  `navigate.root(options?)`; она запускает обычный root resolution через
  policies и index/default/`Router.firstAvailable()`, по умолчанию использует
  `replace: true` и не требует Route token. Transport-строка `'/'` не входит в
  public navigation API.
- Same-target navigation с `revalidate: true` запускает revalidation полной
  committed active branch без пересоздания Route/Module. Это относится ко всем
  navigation surfaces, а не только к пунктам меню.

### 9. Location

- Core `LocationServiceInterface` не раскрывает browser-specific `hash`, raw
  search string или `URLSearchParams`.
- `params` принадлежат только текущей Route текущего runtime и не объединяются с
  params родительского или глобального Router.
- У module и вложенного runtime могут быть разные params; вложенные params могут
  быть `{}`.
- `query` принадлежит Router scope. Root Module по умолчанию читает query root
  Router, а Module активной вложенной Route — query своего Router.
- Внутренний committed location содержит root Router scope и optional цепочку
  вложенных Router scopes. Каждый scope хранит собственные logical address,
  выбранную Route-ветку и query.
- Runtime может предметно получить location/query другого активного scope по
  route token. Доступ не объединяет значения scopes и не меняет scope записи.
- Web bridge проецирует address root Router в pathname, его query — в search до
  `#`, address активной вложенной routing-цепочки — в fragment/hash, а query
  активного вложенного Router — в query-сегмент после hash-address:

```text
/module?a=1&b=2#frame?a=4&b=8&c=9
```

- Знак `?` после `#` является валидным разделителем query вложенного Router, а не
  ошибкой address. Browser search по-прежнему означает только часть до `#`; hash
  query разбирает и сериализует web router bridge.
- Route identity, address projection, params и query остаются scoped.
- `state?: unknown` является transient payload navigation transaction текущей
  Route. Он не входит в logical address, не сериализуется в shared link и не
  восстанавливается после direct link/F5.
- Bridge сохраняет и восстанавливает `state` внутри поддерживаемой им navigation
  session. Если transport не поддерживает такое состояние, приложение не может
  рассчитывать на его сохранение.
- Loader и восстановление Route не должны зависеть от обязательного значения в
  `state`; обязательные восстанавливаемые данные передаются через params или
  query.
- `paramsToObject()` остаётся заменяемым преобразованием route params.
- Публичные `queryToObject()`/`searchToObject()` не требуются: typed query
  conversion скрыта за `RouteQueryServiceInterface` и классом с `@Query()`.
- `RouterParamsConverterInterface` остаётся заменяемым core service.

### 10. Query serialization и conversion

Сохраняется актуальная семантика search/query. Старый `hashParams` grammar вида
`#frame(id='')` не возвращается.

- `number` и `boolean` при web-сериализации становятся строками.
- Число `12` и строка `'12'` после URL round-trip неразличимы.
- Без type conversion значение читается как `'12'`.
- При `enableTypeConversion: true` значение читается как `12`.
- `null`, `undefined`, пустая строка и строка только из пробелов при записи
  удаляют ключ.
- Уже существующий прямой URL `?value=` читается как пустая строка.
- Массив заменяет значения ключа и сериализуется повторяющимися параметрами.
- Пустой массив удаляет ключ; пустые/null/undefined элементы пропускаются.
- Поддерживаются repeated, bracket, indexed и separator arrays.
- Объекты сериализуются в JSON; dotted keys могут собираться во вложенный
  объект.
- Класс с `@Query()` является public declaration query-среза. Его поля по
  умолчанию входят в whitelist serialization/conversion; отдельная маркировка
  exposure не нужна.
- `RouteQueryServiceInterface.get(QueryClass)` создаёт typed instance, применяет
  field transforms, type conversion и runtime validation. Прикладной controller
  не вызывает `plainToInstance`, converter или mapper вручную.
- `RouteQueryServiceInterface.get(QueryA, QueryB, ...)` независимо преобразует и
  валидирует каждый срез, затем возвращает их типизированное пересечение
  `QueryValue<QueryA> & QueryValue<QueryB> & ...` для общего server filter.
- Одинаковый объявленный key в агрегируемых query-классах является ошибкой
  конфигурации; framework не разрешает конфликт порядком аргументов.
- Отсутствующие URL keys представлены в результате через `QueryValue<T>`:
  объявление класса не обязано использовать `?`, definite assignment assertion
  или искусственные default values вроде пустой строки.
- `RouteQueryServiceInterface.set(QueryClass, value)` заменяет только ключи,
  объявленные этим классом, сохраняя query-срезы соседних controllers того же
  Router scope.
- `RouteQueryServiceInterface.clear(QueryClass)` удаляет все ключи этого класса,
  не требуя перечислять их повторно в controller и не затрагивая соседние
  query-срезы.
- Converter и validator остаются сменными внутренними механизмами framework.
- URL-specific `URLSearchParams` и percent encoding принадлежат web bridge.

### 11. Query navigation, history и revalidate

- Query меняется обычной navigation operation.
- Route params и query передаются в одном объекте options; отдельная операция
  `set query` для перехода не нужна:

```ts
await navigate.to(ReportRoute, {
  params: {
    reportId: 42,
  },
  query: {
    page: 2,
    period: new Date(),
    filter,
  },
  state: {
    returnTo: 'dashboard',
  },
});
```

- `replace` и `revalidate` являются optional overrides terminal route
  navigation. Их значения по умолчанию — `replace: false` и
  `revalidate: true`, поэтому прикладной код не обязан передавать их в обычном
  переходе.
- Обычный `navigate.to()` и `navigate.root()` не переносят query предыдущего
  Route. Переданный в terminal options `query` полностью задаёт query нового
  location; при отсутствии `query` новый location получает пустой query.
- `merge` принадлежит только низкоуровневой `navigate.query()`:
  `merge: true` по умолчанию изменяет текущий query, а `merge: false` заменяет
  его в рамках query-only operation. Query-only operation всегда обновляет
  текущую history entry и не создаёт отдельный Back-step.
- `merge` не входит в terminal options `navigate.to()`/`navigate.root()` и не
  меняет правила разрешения или типизации route params.
- Обычный terminal `navigate.to()` с `replace: false` создаёт новую history
  entry; `replace: true` заменяет текущую entry.
- `navigate.query()` и построенные поверх него `RouteQueryService.set()`/
  `clear()` заменяют query snapshot текущей entry независимо от terminal
  navigation default. Поэтому Back не перебирает каждое изменение формы поиска
  или фильтра.
- `searchParams()` в целевой API отсутствует.
- Изменение query ревалидирует Router runtime, которому принадлежит query:
  изменение root/module query ревалидирует root Module, изменение query
  вложенного Router — только активный Module этого Router.
- `{ revalidate: false }` явно отключает revalidate. Это используется, например,
  UI Tabs, сохраняющим активную вкладку в query.
- Родительские runtime не ревалидируются из-за query дочернего Router; изменение
  query родителя не является implicit revalidation дочернего Router.
- Initial direct navigation всегда выполняет первоначальную загрузку.
- Back/Forward восстанавливает navigation snapshot выбранной core history entry.
  Если та же activation сохранена с другим query snapshot, core фокусирует её
  сразу и выполняет только scoped query revalidation без fallback. Metadata
  transport может сохранить явное отключение revalidate, но не является
  источником данных общей ссылки.
- Terminal navigation default `replace: false`, query-only replace-current и
  Router-scoped query revalidation являются отдельно согласованным semantic
  delta.

Концептуальная форма:

```ts
await navigate.query({ tab: 'history' }, { revalidate: false });
```

### 12. Query ownership и cleanup

- Первый уровень ownership — Router scope. Web URL явно разделяет root query до
  `#` и query активного вложенного Router после его hash-address.
- Второй уровень ownership — класс с `@Query()` внутри Router scope. Несколько
  controllers одного Module и одного route token могут объявлять независимые
  классы query и управлять только своими наборами ключей.
- Controller читает свой срез через `query.get(QueryClass)`, записывает через
  `query.set(QueryClass, value)` и очищает через `query.clear(QueryClass)`.
- Data controller читает несколько независимых query-классов одним
  `query.get(SearchQuery, FilterQuery, SortQuery)` для построения общего server
  filter; это не передаёт ему ownership срезов controllers форм. Общая query
  declaration, повторяющая все поля владельцев, для этого не создаётся.
- `set` и `clear` вычисляют keys из metadata `@Query()` и атомарно сохраняют
  неизвестные этому классу keys. Ручное перечисление соседних keys, общий mapper
  и скрытый ownership в `history.state` не нужны.
- Закрытие вложенного Router удаляет его scoped location вместе с его query.
  Root query сохраняется; отдельная cleanup navigation и промежуточная history
  entry не создаются.
- Одинаковое имя key допустимо в query разных Router scopes. Query-классы
  независимых controllers одного scope должны объявлять непересекающиеся keys;
  вариативный `get` отклоняет конфликт до выполнения прикладного запроса, а
  framework не выводит скрытое ownership из порядка аргументов или записей.

### 13. Runtime revalidation

- Revalidate не пересоздаёт Module или Widget runtime.
- Существующие controller/provider instances сохраняются.
- Перезапускаются loaders текущих instances с актуальными scoped params и
  location.
- Локальной revalidation загруженного Module владеет `ModuleRuntime`.
  `RouteRuntime` применяет route-level правила и делегирует controller
  revalidation текущему `ModuleRuntime`, а не инициирует пересоздание Route или
  глобальный refresh navigation tree.
- Вложенная Route использует ту же цепочку `RouteRuntime -> ModuleRuntime` и тот
  же revalidation algorithm, что и любая другая Route.
- Успешный controller action сам по себе не запускает implicit revalidation.
  Обновление выполняется только явной navigation/revalidate operation, как в
  текущем runtime после удаления React Router action transport.
- Если controller action инициировал forward navigation и его Module runtime
  был переведён в `retained`, action всё равно обязан завершить собственный
  observable state. При последующем Back сохранённый экран возвращается с
  `inProcess: false`; late data/error не применяются к уже заменённому или
  освобождённому Module runtime.
- `RevalidateServiceInterface` ближайшего Module/Widget runtime сохраняет
  общий и controller-targeted режимы, observable `inProcess/error` и не
  маршрутизирует локальный вызов через renderer bridge.
- Tokenless `useRevalidate()` запускает общую revalidation owner и агрегирует
  `inProcess/error` общей и любой controller-targeted operation.
  `useRevalidate(Token)` запускает targeted revalidation и наблюдает только
  operation, явно адресованную этому token. Общая operation выполняет loaders
  всех controllers, но не включает keyed state каждого участвующего controller.
- Параллельные operations имеют attribution, cancellation/supersede semantics и
  не применяют late result после новой operation или dispose.
- Изменение session revision прерывает устаревшие loader/action/revalidate
  results и планирует через application coordinator одну refresh wave. Bridge
  подключает к coordinator один handler и не запускает конкурирующую повторную
  policy/revalidation wave.
- Session state имеет три фазы: `unknown`, `authenticated` и `anonymous`.
  Initializer обязан определить начальную фазу до первого policy pipeline;
  поэтому direct link не выполняет защищённый loader до восстановления сессии.
- `setAuthenticated()`, `setAnonymous()` и `setUnknown()` являются управляемыми
  переходами приложения. Уже выполняющийся action может физически закончить
  такой переход, но его результат не применяется после смены revision.
- Истечение защищённой сессии является отдельной операцией `expire()`. Только
  она активно прерывает completion guards зависших runtime operations; это не
  создаёт гонку с action входа или выхода, который сам меняет фазу сессии.
- Защищённый `401` перехватывает application-scoped
  `RequestExecutorInterface`: исходная ошибка не попадает в controller `catch`
  и submit state. Параллельные `401` объединяются в одну recovery operation,
  остальные защищённые запросы отменяются, notifier вызывается один раз для
  ранее authenticated session, затем `expire()` запускает ровно одну
  policy/navigation refresh wave. `401` anonymous-запроса (например, неверные
  credentials формы входа) остаётся обычной recoverable ошибкой action.
- Policy redirect с `saveCurrentLocation` сохраняет attempted logical target,
  а не только предыдущую committed location. Поэтому direct link/F5 на
  защищённый Route восстанавливается после входа; сохранённая location
  однократно consume-ится через `redirectToSaved()`.
- Удаление текущего `FrameRuntime` допустимо только после переноса в
  `ModuleRuntime` его observable revalidation state, controller-targeted
  revalidation, cancellation, serialization и late-result protection.
- Action state остаётся scoped по runtime и controller token: одновременно
  выполняется не более одного submit этого token, recoverable action error
  сохраняется в `submit.error` без разрушения runtime, а переход в `failed`
  происходит только при явной runtime escalation.
- Произвольные controller methods, actions и navigation из них продолжают
  выполняться через общий operation coordinator с корректной attribution;
  renderer hook не получает raw controller в обход runtime.

### 14. Errors, fallbacks и render lifecycle

- Controllers, loaders, actions, providers, render errors, fallbacks и
  exceptions проходят общую framework-механику.
- Renderer adapter типизирует render values, но не создаёт отдельный lifecycle.
- Boundary path вложенной Route имеет порядок
  `Application -> owner Router/Route path -> nested Router -> nested Route -> Module`.
  Module основной Route и Module вложенной Route находятся в независимых
  runtime branches под общей активной Route-ancestry: ошибка или dispose
  вложенного Module не переводит основной Module в failed и не пересоздаёт его.
- Layouts композируются outer-to-inner в пределах своего boundary path. Общий
  prefix layouts остаётся mounted при переходе внутри дочерней ветки.
- Providers принадлежат scope объявившей их boundary. Child scope разрешает
  dependencies через parent scope, но provider instances не копируются, не
  объединяются в плоский список и не пересоздаются из-за дочернего перехода.
- Provider lifecycle, его cardinality, порядок и cleanup определены отдельно в
  разделе 15. Renderer render/commit не является core provider phase.
- `fallback`, `exception`, `forbidden` и `notFound` разрешаются от ближайшей
  активной boundary к Application.
- Render failure Module view остаётся в его ModuleRuntime. Render failure
  Router shell или Router-level layout принадлежит RouterRuntime, освобождает
  только его вложенную активную ветку и не переводит owner screen Module либо
  Application в failed. Обычный renderer rerender не перезапускает тот же
  failed location автоматически.
- До разрешения lazy import используется унаследованный/global fallback.
- После разрешения module declaration локальные `Module.fallback` и
  `Module.exception` имеют приоритет внутри Module до завершения подготовки его
  runtime.
- В React Native fallback и resolved boundary outcome принадлежат content
  конкретной physical presentation candidate activation. Переход
  `fallback -> view | exception | forbidden | notFound` не меняет identity
  screen и не является navigation transition. Ошибка подготовки не возвращает
  пользователя без объяснения на предыдущий screen: target presentation
  отображает разрешённый exception/boundary outcome. Если outcome committed,
  она становится обычной history entry; если operation остаётся pending, Back
  отменяет её и открывает предыдущую committed presentation.
- `forbidden` и `notFound` принадлежат только Application, Router и Route;
  Module их не объявляет.
- Ошибка renderer compatibility возникает после import и до выполнения
  прикладного runtime-кода.

### 15. Provider lifecycle

Provider является участником lifecycle state machine, выбранной его
lifetime, а не набором callbacks относительно controller loader или renderer
render. Core различает lifecycle state и runtime operations:

```text
created -> initialized -> prepared -> active <-> retained -> disposing -> disposed
```

`load`, `action`, `revalidate` и обновление runtime input являются operations
внутри lifecycle и не образуют дополнительные lifecycle states. Renderer
render/commit является milestone конкретного adapter и не добавляется в core
provider contract.

В публичной модели есть одна сущность Provider, один decorator
`@Provider(options?)` и один class contract `ProviderInterface<TProps = never>`. Class
interface не меняется в зависимости от lifetime. Decorator выбирает
одну из двух стратегий жизни instance:

```ts
@Provider()
class WidgetPreloadProvider implements ProviderInterface<WidgetProps> {}

@Provider({ lifetime: 'application' })
class TerminalChangesProvider implements ProviderInterface {}
```

- `lifetime: 'runtime'` используется по умолчанию. Framework создаёт
  отдельный instance в pipeline объявившего его Router, Route, Module
  или Widget. Provider из Layout metadata участвует в pipeline runtime
  boundary, которой принадлежит Layout, и не превращает Layout в
  отдельный runtime owner;
- `lifetime: 'application'` создаёт один application-scoped instance с
  reference-counted leases от runtime owners.

Option называется `lifetime`, а не `scope`: она меняет identity,
cardinality, activation и disposal instance, а не DI visibility. Один
class interface не означает одинаковую доступность всех hooks: допустимые
capabilities определяются выбранным `lifetime`.

| Hook/capability       | `runtime`                          | `application`                        |
| --------------------- | ---------------------------------- | ------------------------------------ |
| `initialize`          | optional, один раз на instance     | optional, один раз на instance       |
| `prepare`             | optional, на candidate preparation | недоступен                           |
| `activate`            | optional, на active-период         | optional, на период ненулевых leases |
| provider revalidation | optional explicit capability       | недоступена                          |
| `dispose`             | обязателен, один раз на instance   | обязателен, один раз на instance     |

Framework не игнорирует неподдерживаемый hook молча. Bootstrap до
запуска прикладного lifecycle отклоняет, например,
`@Provider({ lifetime: 'application' })` с `prepare` или provider
revalidation capability. Error содержит provider token, lifetime и имя
недопустимого hook.

Runtime strategy проходит полную state machine выше в lifecycle своего
owner. Application strategy не имеет candidate preparation и поэтому
переходит из `initialized` в `active` при первой lease, не входя в
`prepared`.

#### Runtime provider

Целевой runtime provider поддерживает следующие hooks и guarantees:

- `initialize(context)` выполняется не более одного раза после создания
  provider instance и разрешения его dependencies. Это owner-lifetime
  initialization, не зависящая от renderer mount;
- `prepare(context)` выполняется для каждой candidate preparation после
  успешных policies и до commit owner runtime. Это blocking preparation: пока
  она не завершена, initial fallback или application splash остаётся активным;
- `activate(context)` выполняется при каждом переходе provider owner в
  `active`/`focused`. Один instance может получить несколько вызовов после
  переходов `active -> retained -> active`;
- участие provider в `revalidate` является отдельной optional capability, а не
  автоматическим повтором lifecycle hooks. Обычный revalidate не вызывает
  `initialize`, `prepare` или `activate`;
- `dispose()` является обязательным методом `ProviderInterface` и
  выполняется framework ровно один раз для каждого созданного instance, в том
  числе после частично завершившихся, отменённых или failed initialization и
  preparation;
- framework ожидает async lifecycle cleanup и `dispose()`, вызывает provider
  `dispose()` до освобождения его DI dependencies и изолированно репортит
  cleanup failure, не прерывая cleanup соседних participants;
- provider без захваченных ресурсов реализует пустой `dispose()`. Provider,
  подключающий socket, subscription, listener, timer, preload lease или внешний
  runtime, хранит соответствующий handle в своём instance и освобождает его в
  обязательном `dispose()` согласно lifetime declaring boundary.

`initialize`, `prepare` и `activate` могут дополнительно вернуть cleanup для
ресурса конкретного вызова. Такой cleanup не заменяет обязательный `dispose()`
provider instance и не складывается в общий append-only список:

- cleanup `initialize` удерживается до финального disposal instance;
- cleanup candidate `prepare` выполняется немедленно при abort/discard; после
  успешного commit он становится текущим prepared cleanup, а cleanup ранее
  committed preparation выполняется только после атомарной замены;
- cleanup `activate` выполняется перед переходом `active -> retained`, перед
  следующим `activate` и перед final disposal;
- каждый возвращённый cleanup выполняется ровно один раз. Один и тот же ресурс
  не должен одновременно освобождаться returned cleanup и `dispose()` provider.

Final disposal имеет порядок: cleanup текущего active периода, cleanup текущей
preparation, cleanup initialization, обязательный `provider.dispose()`, затем
освобождение provider DI dependencies. Это позволяет provider использовать
`dispose()` для собственной интеграции с socket или внешним lifecycle, а
framework-owned helper lease освобождать через result конкретного hook.

Каждый hook получает свой phase-specific context. Общего поля `phase`, по
которому provider самостоятельно ветвит поведение, нет. Общие
`initialize`/`activate` contexts не притворяются runtime context и не содержат
`params` или `props`. Только доступные при `lifetime: 'runtime'`
`prepare` и revalidation capability получают immutable snapshot актуальных
`params` и `props`, а также operation `AbortSignal`; `dispose()` не отменяется
operation signal.

Initial activation имеет общий stage order:

```text
policies
-> resolve provider instances
-> initialize providers
-> controller loaders || prepare providers
-> activate providers
-> atomic runtime commit
```

Controller loaders и provider preparation независимы и запускаются параллельно.
Hooks разных providers внутри одного stage также независимы; порядок tokens в
`providers: [...]` не является dependency contract. Зависимость между двумя
operations выражается через DI/service либо внутри одного provider, а не через
позицию в metadata.

При abort или failure до commit candidate runtime не заменяет текущий active
runtime: cleanup отменённой candidate preparation выполняется немедленно, а
ранее committed provider state сохраняется. Если provider instance был создан
только для discarded candidate, после operation cleanup он получает
`dispose()`. Переход `active -> retained` выполняет cleanup active-периода без
`dispose()`; возврат вызывает новый `activate()` на том же instance. Фактическое
удаление retained entry либо owner boundary выполняет final cleanup и
`dispose()`.

Revalidation сохраняет active presentation и запускает controller loaders
вместе только с явно подключёнными provider revalidation participants. Она не
показывает initial fallback, не создаёт новые provider instances и не меняет
prepared/active lifecycle. Recoverable provider revalidation error публикуется
в scoped revalidation state; terminal failure требует общей явной runtime
escalation.

#### Application lifetime

Provider с `lifetime: 'application'` использует тот же `ProviderInterface`, но
его instance живёт на application level и не имеет runtime context:

- provider instance и его dependencies создаются в `ApplicationScope` один раз;
- `initialize()` выполняется один раз для instance;
- переход active lease count `0 -> 1` вызывает `activate()`, дополнительные
  leases ожидают ту же in-flight activation и не повторяют её;
- переход active lease count `1 -> 0` выполняет cleanup текущей activation;
  последующая новая lease может снова активировать тот же instance;
- dispose Application при активном provider сначала выполняет cleanup текущей
  activation, затем обязательный `dispose()` ровно один раз;
- application-lifetime provider не имеет `prepare`, runtime revalidation
  capability, `params` или `props`;
- `AbortSignal` его `initialize`/`activate` принадлежит Application и
  отменяется только при application disposal, а не при отмене navigation,
  Module, Route или Widget operation отдельной lease.

Так reference counting управляет периодом фактического использования shared
resource, а `dispose()` остаётся финальной границей lifetime самого provider
instance.

Старые phases целевым API не являются:

- `setup` разделяется на однократный `initialize` и повторяемый `activate` с
  cleanup активного периода;
- `beforeLoad` и `beforeRender` заменяются семантическим `prepare` без привязки к
  взаимному расположению provider и controller code;
- `afterRender` не переносится в core; renderer-specific effect принадлежит
  adapter или presentation;
- `onDemand` заменяется конкретным typed service/runtime operation;
- provider revalidation объявляется отдельной capability и никогда не выводится
  из факта наличия `prepare`.

## Отклонённые варианты

- Хранить renderer entities в `@sellgar/app` core.
- Делать React Router источником истины для framework lifecycle.
- Использовать отдельную публичную конфигурацию `NavigationScope`.
- Возвращать отдельные `navigate.frame.open()` / `navigate.frame.close()` как
  основную универсальную навигацию.
- Добавлять в Router обязательные `activation`, `history`, `retention` flags.
- Передавать `bindings` через `Module` metadata.
- Автоматически выбирать renderer-specific module внутри `load()`.
- Объединять params родительского и вложенного Router.
- Глобально ревалидировать все активные runtime при любом query change.
- Считать UI Tabs отдельным Router.
- Восстанавливать старую `hashParams` grammar.
- Описывать parameterized address строковой web-грамматикой вида
  `users/:userId/edit`; для universal contract сохраняется структурная
  форма `segments(..., param(...))`.
- Считать query после `#` browser search или смешивать его с query root Router.
  Query вложенного Router после hash-address является отдельной проекцией web
  bridge.
- Хранить ownership query только в памяти или только в `history.state`, если
  ссылка должна восстанавливать состояние.
- Публиковать `RouteRef` как обязательную вторую декларацию до подтверждения
  developer ergonomics.
- Связывать class token и Route через публичный
  `Route.configure(RouteClass, options)`.
- Заменять `new Route()` decorator-ом `@Route(...)`: class token и route-tree
  declaration имеют разные роли, как event token и его регистрация в EventBus.
- Сохранять в universal core относительные provider phases `beforeLoad`,
  `beforeRender`, `afterRender`, а также неопределённый `onDemand`.
- Сохранять отдельные `@Provider` / `@SingletonProvider` и разные
  class interfaces для двух lifetime strategies одной сущности Provider.
- Молча игнорировать hook, недоступный для выбранного provider
  lifetime.
- Использовать возвращаемый cleanup вместо обязательного `dispose()` provider
  instance либо накапливать cleanup повторяемых hooks в append-only списке.

## Package direction

Реализация принадлежит repository `sellgar.app.ui` и публикуется как
`@sellgar/app`. Consumers подключают её целиком по публичным package boundaries;
backward-compatible aliases отсутствуют. Параллельного framework package или
private cross-package imports нет.

Согласованное соответствие текущих понятий целевой модели:

```text
FrameRouter        -> вложенный Router
FrameRoute         -> Route
FrameRouterRuntime -> единый RouterRuntime
FrameLayer         -> renderer-owned Router host/outlet
FrameRuntime       -> удаляется после переноса module lifecycle в ModuleRuntime
FrameRouterScope   -> RouterScope для boundary Router и RouteScope для выбранной Route
FrameScope         -> ModuleScope загруженной business-unit
Frame              -> Module; alias удаляется
app.frames(...)    -> app.routing(...); alias удаляется
navigate.frame.close() -> navigate.close(); alias удаляется
navigate.replace('/')  -> удаляется; root navigation выражается navigate.root()
@SingletonProvider() -> @Provider({ lifetime: 'application' })
RuntimeProviderInterface / SingletonProviderInterface -> ProviderInterface
```

Текущий `RouterRuntime` не считается готовой целевой реализацией: его React-era
registry и отдельную hash/frame orchestration нужно заменить core state machine
логического route tree. Текущие frame abstractions нельзя удалять механически
до переноса lifecycle-гарантий, появления regression tests и migration plan.

### Проекция ManagementPanelApplication

Production composition `sellgar.ui.admin/clients/admin/src/application/admin.application.tsx`
является обязательным migration fixture для целевого контракта.

Его верхнеуровневая конфигурация переносится без изменения lifecycle:

| Текущий вызов                           | Целевая ответственность                                                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `@UseBindings(ManagementPanelBindings)` | core без изменений                                                                                                                  |
| `app.components(...)`                   | тот же вызов renderer-specific configurator                                                                                         |
| `app.initializers(...)`                 | core без изменений                                                                                                                  |
| `app.layouts(...)`                      | тот же вызов с renderer-specific Layout tokens                                                                                      |
| `app.frames(...)`                       | `app.routing(...)` с тем же inheritance contract; старое имя удаляется                                                              |
| `app.features(...)`                     | те же application-scoped capabilities; Feature/Presentation и layer берутся из renderer adapter, runtime/service/bindings — из core |
| `Router.baseUrl`                        | `basePath` web bridge при bootstrap                                                                                                 |
| `Route.path`                            | structured `Route.address` внутри текущего Router scope                                                                             |
| `Route.frames`                          | `Route.routing`                                                                                                                     |
| `FrameRouter` / `FrameRoute`            | вложенный `Router` / обычный `Route`                                                                                                |
| строковые policy redirects              | route tokens или root-resolution policy outcome                                                                                     |

Фактическая topology приложения принципиально содержит одновременно основную
Route-ветку и optional вложенный Router scope:

```text
root Router
├─ anonymous boundary
│  ├─ sign-in Module
│  ├─ password-set Module
│  └─ management-user-invitation-accept Module
└─ authenticated boundary + NavigateLayout
   ├─ main Route branch
   │  ├─ terminals boundary + TerminalMonitoringLayout
   │  │  ├─ terminals Module + terminal-details routing
   │  │  └─ terminal-registrations Module + registration-details routing
   │  ├─ incidents Module
   │  ├─ users boundary + UsersLayout
   │  │  ├─ users Module + user-details routing
   │  │  └─ management-user-invitations Module + management-user-invitation-details routing
   │  └─ notifications boundary + NotificationsLayout
   │     ├─ subscriptions Module + subscription routing
   │     └─ channels Module + channel routing
   └─ incident-details routing, доступный всей authenticated Route-ветке
```

`terminal-registration/create` и `management-user-invitation/create` routing объявлены
на parent boundary и поэтому доступны обоим её активным child Modules.
`incidents/:id` routing объявлен на authenticated boundary и доступен всей
активной authenticated ветке. Перенос этих Routers на конкретный leaf ради
получения плоской цепочки изменил бы production availability и scope ownership.

Три feature из текущей конфигурации также являются обязательным migration
fixture:

- `NavigationBlockerFeature` сохраняет одну глобальную presentation приложения,
  local override из renderer hook и core-scoped registrations переходов;
- `NotificationFeature` сохраняет общую очередь, timers и handles в
  ApplicationScope, а web placements и React views переносит в React adapter;
- `UserRequestFeature` сохраняет общую FIFO очередь и awaitable результаты, а
  renderer views и renderable labels переносит в adapter.

Ни одна из этих feature не должна быть реализована повторно внутри Router
bridge. Router bridge только передаёт navigation events для blocker; notification
и user request вообще не зависят от способа маршрутизации.

Проекция notification subscriptions на новый контракт:

```ts
export class NotificationSubscriptionsRoute {}
export class NotificationSubscriptionCreateRoute {}

export class NotificationSubscriptionReviewRoute {
  readonly id: string;
}

export class NotificationSubscriptionEditRoute {}

new Route({
  address: segments('notifications'),
  layouts: [NotificationsLayout],
  routes: [
    new Route({
      token: NotificationSubscriptionsRoute,
      load: () => import('@module/notification-subscriptions'),
      routing: [
        new Router({
          routes: [
            new Route({
              address: segments('notification-subscriptions'),
              routes: [
                new Route({
                  token: NotificationSubscriptionCreateRoute,
                  address: segments('create'),
                  load: () => import('@frame/notification-subscription-create'),
                }),
                new Route({
                  token: NotificationSubscriptionReviewRoute,
                  address: segments(param('id')),
                  routes: [
                    new Route({
                      load: () => import('@frame/notification-subscription-review'),
                    }),
                    new Route({
                      token: NotificationSubscriptionEditRoute,
                      address: segments('edit'),
                      load: () => import('@frame/notification-subscription-edit'),
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ],
});
```

Для edit root Router scope остаётся `notifications`, а вложенный Router scope
разрешает `notification-subscriptions/:id/edit`. Web bridge восстанавливает
текущий вид ссылки:

```text
/notifications?search=critical#notification-subscriptions/42/edit
```

Переходы сохраняют существующий runtime result:

- открытие create/review/edit не перезагружает subscriptions Module;
- review и edit являются sibling leaf Modules одной вложенной Route-ветки, а не
  одновременно активными Module instances;
- закрытие вложенного scope сохраняет subscriptions Module и его query;
- direct link/F5 подготавливает subscriptions Module и выбранный вложенный
  Module параллельно после успешных route policies.

## Требования к проверкам будущей реализации

- Core source/import graph и core public `.d.ts` не содержат `react`,
  `react-dom`, `react-router`, `mobx-react` или React Native. Core-only
  compile/runtime fixture запускается без установки renderer packages.
- React/React Native facade type fixtures проверяют один core lifecycle и
  renderer-specific типы Application, configurator, Module, Route, Layout,
  Widget, Feature/Presentation и hosts/hooks.
- Core feature contracts, включая notification/user-request payload storage и
  navigation-blocker pending decision, не содержат renderer component types.
  Renderer facade type fixtures отдельно проверяют ReactNode и React Native
  component payload/presentation types без создания второго service token или
  runtime.
- Application feature lifecycle tests проверяют однократную активацию bindings
  и сохранение feature runtime при Route transition, nested Router open/close,
  revalidate, web hash change, native screen blur и tab switch.
- Notification tests сохраняют status/defaults, порядок queue, handle close,
  auto-close timeout, pause/resume и явную ошибку отсутствующего status view;
  React adapter tests отдельно сохраняют восемь placements, `bottom-right` и
  portal/interaction behavior.
- User-request tests сохраняют FIFO, последовательное отображение, результаты
  apply/cancel для alert/confirm/prompt и явную ошибку отсутствующего kind view
  без автоматического разрешения promise.
- Navigation-blocker feature tests разделяют core и adapter: core выбирает
  leaving boundaries и ordered registration identities без presentation types;
  adapter сохраняет global/local resolution, приоритет nested boundary и
  cleanup mapping вместе с registration.
- Widget contract tests проверяют identity
  `ownerScope + token + (runtimeKey ?? default)`: несколько host одной identity
  получают один runtime и process state, разные keys либо owner scopes — разные
  runtimes.
- Widget props tests проверяют last-accepted-update semantics общего runtime:
  несколько host одной identity обновляют одни props, superseded/late updates
  не перезаписывают актуальное значение, in-flight operation сохраняет свой
  snapshot, а следующая operation читает последнее принятое значение.
- Shared WidgetRuntime использует host/preload leases, не dispose-ится при
  удалении одного consumer, освобождается после последнего lease или owner
  disposal и переиспользует prepared runtime без повторного loader.
- Renderer rerender, React StrictMode replay и native retained-screen
  detach/focus не пересоздают WidgetRuntime; фактическое удаление embedding
  выполняет controller/provider/scope cleanup ровно один раз.
- Widget loader/action/revalidate/failure остаются локальными runtime operation:
  соседний Widget и owner Module не получают implicit revalidate либо failed
  state.
- Core routing tests не используют понятия Stack, Tabs, Drawer, pathname, hash
  или portal. Adapter contract tests отдельно проверяют web URL/frame
  projection, основной React Native navigation surface, режимы с tab bar и без
  него и Stack projection `Route.routes` одного logical Router tree. Projection
  `Route.routing` добавляется в этот набор после отдельного согласования.
- Одинаковая navigation state machine для programmatic navigation, direct link,
  Back/Forward и bridge events.
- Root-to-child, child-to-sibling, child-to-parent и cross-branch transitions.
- Named navigation type tests проверяют exact локальные params одиночного
  `navigate.to()`, переиспользование committed params активного предка и запрет
  передачи params чужой Route.
- Fluent navigation tests проверяют одинаковое имя param у нескольких Route,
  exact params каждого `through()` и terminal `to()`, явную target-семантику
  только у `to()`, отсутствие operation до terminal-вызова и ровно одну
  navigation transaction после него.
- Renderer Link/NavItem contract tests собирают тот же внутренний request с
  явным target и scoped `through` bindings, не объединяют одинаковые param names
  и проходят общий resolve/blockers/policies/prepare/commit pipeline.
- Link/NavItem active-state tests сохраняют active состояние parent Module target
  при открытой вложенной Route, а повторная активация active target через любой
  navigation surface запускает revalidation полной active branch.
- Runtime resolver tests отклоняют повторный `through` token, включение target в
  `through()`, sibling/descendant anchor и неверный порядок, но самостоятельно
  восстанавливают tokenless structural Routes, layouts, Routers и
  параметрически нейтральные промежуточные Route.
- Routing-only Route создаёт RouteScope и дочерний RouterRuntime без фиктивного
  ModuleRuntime; переход и dispose сохраняют обычные policy/provider/layout
  boundaries.
- Navigation blocker для программного перехода, Back/Forward, nested Route
  close, scoped `allow()` и web `beforeunload`.
- Scoped navigation tests проверяют `navigate.close()` после обычного открытия
  и direct link, сохранение owner branch, освобождение nested runtime и отсутствие
  вызова bridge-backed `back()`.
- Root-resolution tests проверяют `navigate.root()` без Route token, применение
  policies и index/default/`Router.firstAvailable()`, default `replace: true` и
  отсутствие transport-строки `'/'` в public navigation API.
- Policy redirect type/runtime tests допускают только точные target `params`,
  `replace` и `saveCurrentLocation` и отклоняют `query`, `state`, `merge` и
  `revalidate`, fluent `through` и target с недостающими params неактивного
  предка.
- Сохранение родительских runtime и controller/provider instances.
- React web lifecycle tests проверяют режим `release`: переход между основными
  Routes dispose-ит покинутый ModuleRuntime, browser Back создаёт новый runtime и
  повторно выполняет loaders; owner Module открытого frame при этом сохраняется,
  а закрываемый frame dispose-ится отдельно.
- React Native stack/tab projection сохраняет ModuleRuntime, controllers и
  providers retained screen при push, blur и переключении tab, переиспользует
  их при возврате и освобождает при pop/reset/session branch removal. Переход
  `retained -> focused` показывает сохранённые данные без fallback/splash и
  не запускает loaders либо revalidation. Отдельные tests проверяют явный
  pull-to-refresh, повторную активацию active target и query revalidation:
  текущие данные остаются видимыми, success заменяет их, recoverable error
  остаётся в revalidation state, а late completion не применяет устаревший
  результат.
- React Native keyboard scenarios проверяются на физическом устройстве:
  `Viewport` ordinary screen и frame оставляют нижний focused input
  видимым; первый tap по видимому action не теряется; drag, начатый при открытой
  клавиатуре, не запускает pull-to-refresh и не закрывает frame; следующий новый
  drag соответственно может ревалидировать Module либо закрыть frame. Prompt в
  React Native `Modal` получает autofocus после `onShow`, остаётся над Layout,
  блокирует underlying interaction и использует собственный `Viewport` внутри
  единого application `KeyboardSurface`; focused
  input и actions остаются достижимыми при открытой клавиатуре.
- React Native navigation-history tests проверяют одинаковую семантику истории
  для tab, link, navigation item и imperative navigation, в том числе возврат
  `Products -> Brands -> Categories -> Back -> Brands -> Back -> Products`.
  Каждый Back удаляет покидаемую entry, выполняет child-to-parent cleanup её
  исключительно принадлежащего runtime graph и немедленно показывает предыдущий
  retained screen без fallback/loader. Отдельно проверяются переиспользование
  ранее загруженного runtime при переходе вперёд и отсутствие новой history entry
  при повторной активации focused target. Root Back tests проверяют, что первый
  Back на `Router.firstAvailable()` не сворачивает приложение, второй Back в
  пределах интервала сворачивает его, а истечение интервала требует новой пары
  нажатий.
- React Native scenario tests различают новый `preparing` target с локальным
  fallback внутри target screen, retained target с немедленно сохранённой
  presentation и отмену незавершённого перехода через Back без revalidation
  committed entry. Target physical presentation должна появиться до завершения
  loader, сохранить identity и mount при замене fallback на готовый Module либо
  boundary outcome и не отправить вторую navigator action после core commit.
  Отдельно проверяется стабильная identity screen при изменении query и различная
  identity для разных Route params, включая route, разрешённый из `root()` через
  default/index/policies.
- Native Route presentation tests проверяют отсутствие animation по умолчанию,
  локальность свойства без наследования, один общий transition progress пары,
  владение preset входящим Route для `push`/`replace` и покидаемым Route для
  Back/`pop`, переход глубокого Route в соседнюю tab/Route-ветку, прерывание
  быстрыми последовательными навигациями без пустого кадра, начало enter-
  transition с fallback target screen, отсутствие повторного transition при
  готовности Module и отсутствие transition у неизменившихся layout/outlet
  уровней.
- Native projection tests проверяют отдельную identity history entry и core
  activation, отсутствие переупорядочивания buried screens, один экземпляр
  Layout на общей Route-ancestry, Route с одновременными `load + routes`,
  независимые parameterized runtimes, точную принадлежность animation
  конкретному Route и pending screen после неизменившегося nested layout prefix.
  Scenario smoke отдельно проверяет отсутствие дублированного tab bar во время
  animation, видимый непрозрачный fallback внутри target screen и отсутствие
  промежуточного blank/black кадра при произвольной скорости последовательных
  переходов. Navigator test harness обязан исполнять stack state, focus,
  transition start/end и unmount на pop; mock, который только рендерит children
  `Screen`, не является достаточным доказательством этих сценариев.
- Abort целевой подготовки без повреждения текущей ветки.
- Scoped params без merge и независимый query каждого Router scope.
- Web bridge contract для `/module?a=1#frame?b=2`, включая валидный `?` после
  hash-address, direct link/F5 и независимый round-trip обоих query scopes.
- `@Query()` contract: automatic whitelist/exposure, transforms, type conversion,
  validation, `QueryValue<T>` для отсутствующих keys и отсутствие обязательных
  `?`/`!`/default values в declaration.
- Несколько query-классов одного route token: одиночный `get`, `set` и `clear`
  работают только с выбранным классом и сохраняют срезы соседних controllers;
  вариативный `get` возвращает типизированное пересечение независимых срезов и
  отклоняет пересекающиеся declarations.
- Query conversion matrix, Router-scoped cleanup и history push/replace.
- Query revalidation matrix: изменение module query ревалидирует только module
  Router, изменение frame query — только frame Router; equivalent update не
  запускает operation.
- Scoped transient state, его восстановление поддерживающим bridge и отсутствие
  зависимости loader от state после direct link/F5.
- Scoped revalidate, `{ revalidate: false }`, concurrent operations и late
  completion.
- Revalidation attribution matrix: общая operation видна только tokenless
  handle; targeted `A` видна tokenless handle и `useRevalidate(A)`, но не
  `useRevalidate(B)`; targeted `B` симметрично видна tokenless handle и
  `useRevalidate(B)`.
- Direct link/F5 для module плюс вложенная Route.
- После успешных policies первоначальная подготовка основного Module и активной
  вложенной Route идёт параллельно под application splash; подготовленный
  runtime переиспользуется renderer host после mount.
- Web hash-only переход меняет вложенную Route без повторной загрузки основного
  Module; закрытие и Back/Forward сохраняют существующую history-семантику.
- Доступность вложенного Router только из активной Route-ветки, наследование
  доступности от активных родителей и приоритет ближайшего владельца при
  пересекающихся address candidates.
- Несколько Router-кандидатов на одном Route level, выбор итоговой ветки и
  отсутствие активации runtime невыбранных кандидатов.
- Prepare/commit/discard, сохранение текущего UI во время same-route
  revalidation и отсутствие повторных runtime instances при renderer
  StrictMode replay.
- Текущая семантика controller action state, явной runtime escalation и одной
  session-revision refresh wave.
- Provider lifecycle matrix: однократные `initialize`/`dispose`, повторяемые
  candidate `prepare` и `activate`, partial initialization failure, abort до
  commit, atomic replacement prepared cleanup, retained/focused cycles, explicit
  provider revalidation и отсутствие lifecycle hooks при обычном revalidate.
- Application-lifetime provider lifecycle: один application-scoped instance,
  конкурентные leases, ровно один `activate` на переходе `0 -> 1`, один activation
  cleanup на
  `1 -> 0`, повторная activation после новой lease и финальный `dispose()` при
  disposal Application.
- Provider configuration validation: один `ProviderInterface` для обоих
  lifetime strategies, default `runtime`, явный `application` и bootstrap
  error для недоступного hook.
- Renderer compatibility errors до запуска прикладного кода.
- Ошибка bootstrap при повторной регистрации route class token.
- React, React Native и non-URL fake bridge contract tests без зависимости core
  tests от конкретного renderer.
- Web и React Native nested Router разрешают local/default `@Shell`; отсутствие
  обоих вариантов отклоняется renderer как configuration error, но не core.
  Native screen без shell строится через `Route.routes`, а не `Route.routing`.
- Полная migration characterization для `ManagementPanelApplication`, включая
  active main Module плюс routing владельца на ancestor Route, policy
  continuation, root navigation, Link/NavItem pending state и scoped close из
  controller.

## Правило дальнейшего проектирования

Каждое следующее согласованное решение сначала добавляется в этот RFC. Примеры
и новые вопросы должны ссылаться на уже зафиксированный universal contract, а
не на текущую web-only реализацию.
