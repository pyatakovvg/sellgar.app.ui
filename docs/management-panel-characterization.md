# Сверка `@sellgar/app` с текущим Management Panel

- Статус документа: current
- Статус миграции production-приложения: не начата
- Область: framework-механики, необходимые для будущей миграции React-приложения

Этот документ фиксирует не план переписывания production-кода, а проверяемую
сверку механик. Источник фактической production-композиции —
`clients/management-panel/src/application/management-panel.application.tsx`.
Целевой контракт — accepted
[RFC](../../tiyn-app/docs/rfc/universal-core-renderers-router-bridge.md).

## Карта соответствия

| Production-механика                                                               | Контракт v2                                                                                                                    | Проверка до миграции                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Application components: splash, fallback, failed, exception, forbidden, not found | React `ApplicationConfiguratorInterface.components()`; initial preparation закрывается splash, transition — ближайшим fallback | playground startup и boundary routes; application routing lifecycle tests |
| Initializers до первого route                                                     | renderer-neutral application initializers до bridge initialization                                                             | application initializer и authentication tests                            |
| Anonymous/authenticated branches                                                  | `canMatch`, token redirects, saved logical location, session refresh                                                           | `application-authentication.test.ts`; playground protected `401` flow     |
| `401` не протекает из request                                                     | application-scoped `RequestExecutorInterface`, session expiration notifier до anonymous transition                             | request executor/session tests; playground alert → sign-in → restore      |
| Application и branch layouts                                                      | React declarations композируют layouts, bindings и providers над одним core scope                                              | playground `MainLayout`/`NavigateLayout`; package typecheck/build         |
| Route modules, loaders, actions и revalidate                                      | core `RouteRuntime` + `ModuleRuntime`; React `@Module` и controller hooks                                                      | module/provider/runtime tests; playground runtime diagnostics             |
| Routing-only branches, index/default/first available                              | разрешаются core route graph до prepare без фиктивного Module                                                                  | `application-routing-lifecycle.test.ts`                                   |
| Frame routers по hash                                                             | nested `Router` с отдельным logical state, application-level frame layer и `@Shell`                                            | nested navigation/browser smoke; close/navigation service tests           |
| Локальные frame fallback/exception                                                | boundary принадлежит nested Router/Route; owner Module остаётся committed                                                      | authentication/pending-boundary tests; playground shell transitions       |
| Access policies                                                                   | renderer-neutral `@Policy`, `canMatch`, `canActivate`, `canAction`, typed result handlers                                      | policy boundary tests; playground forbidden/not-found diagnostics         |
| Module guards                                                                     | renderer-neutral `@Guard`/`UseGuards`; React `useGuard`/`Guarded`                                                              | guard runtime tests; playground guard diagnostics                         |
| Runtime providers                                                                 | единый `@Provider(options)`, runtime/application lifetime, обязательный `dispose`                                              | provider pipeline and widget runtime tests                                |
| Widgets с preload под общим fallback                                              | core widget identity/leases/preloader; React `WidgetHost`                                                                      | widget registry/runtime/preloader tests; playground widget diagnostics    |
| Navigation blocker                                                                | core blocker boundary; React presentation/hook                                                                                 | blocker core/registry tests; playground toggle and Back smoke             |
| Notifications                                                                     | core queue/timers/handles; React presentation in notification layer                                                            | notification tests; playground notification diagnostics                   |
| Alert/confirm/prompt                                                              | core FIFO requests; React modal presentation layer                                                                             | user-request tests; playground request diagnostics                        |
| Typed route navigation                                                            | terminal `to()`, configurator-only `through()`, exact local params                                                             | `contracts/navigation-contracts.fixture.tsx`; navigate service tests      |
| Bare links and arbitrary controls                                                 | `NavLink` delegates anchor properties; `NavItem` delegates execution state                                                     | compile-time fixture; playground menu/actions                             |
| Query/state and scoped revalidate                                                 | global logical query, route-scoped initiator, no runtime recreation                                                            | navigation/location tests; playground query diagnostics                   |
| Application events and reactive entities                                          | renderer-neutral event bus and entity registries; transparent React adapters                                                   | corresponding core tests; playground diagnostics                          |
| DOM modality order                                                                | application root → frame → modal → notifications; OverlayHost owns body layers                                                 | playground browser smoke; React adapter source boundary                   |

## Production topology

Текущее приложение использует две root-зоны:

1. anonymous layout с sign-in, password set и invitation accept;
2. authenticated layout с sections terminals, incidents, users и notifications.

Внутри sections применяются branch layouts и nested frame routers: review,
create и edit сценарии. Incident review дополнительно принадлежит общему
authenticated ancestor. Эта топология выражается v2 через обычные `Route`,
nested `Router`, layouts и `@Shell`; отдельные `FrameRoute`/`FrameRouter` в v2
не требуются.

## Что не является framework gap

Production bindings, access policy options, domain gateways, SignalR providers,
конкретные modules/layouts/frames/widgets и их view переносятся отдельной
миграцией. Они являются consumers framework API, а не отсутствующими частями
v2. Полный Native adapter и FSM также не входят в текущую React-задачу.

До начала миграции должны одновременно проходить core-only typecheck, полный
package typecheck, framework tests, playground build и ручная browser-матрица
root/nested navigation, query, Back/close, boundaries, supersede и protected
`401` restore.
