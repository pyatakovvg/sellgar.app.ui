# Policies, Revalidate И Ошибки

Этот раздел описывает три разных механизма:

- policies управляют доступом к route boundary;
- revalidate обновляет active data;
- runtime operation flow отделяет lifecycle interruption, HTTP rejection и failure;
- runtime reporter фиксирует ошибки runtime-слоя.

## Policies

Policies защищают route boundaries.

Доступные slots:

```ts
new Route({
  canMatch: [RequireAuthenticatedSessionPolicy],
  canActivate: [CanViewOrdersPolicy],
  canAction: [CanEditOrdersPolicy],
  load: () => import('@module/orders'),
});
```

Смысл slots:

```text
canMatch
  можно ли матчить route и загружать module

canActivate
  можно ли активировать route/module

canAction
  можно ли выполнить action на route/module
```

Policy contract:

```ts
@Policy()
export class RequireAuthenticatedSessionPolicy extends PolicyInterface {
  constructor(
    @Inject(SessionRuntimeStateInterface)
    private readonly session: SessionRuntimeStateInterface,
  ) {
    super();
  }

  execute(): PolicyResult {
    if (this.session.phase === 'authenticated') {
      return { type: 'pass' };
    }

    return {
      reason: 'Session is not authenticated.',
      type: 'fail',
    };
  }
}
```

Policy result:

```ts
{ type: 'pass' }
{ type: 'fail', reason?: string, data?: unknown }
```

## Boundary Decisions

`Router` предоставляет helpers для policy result handling:

```ts
Router.continue();
Router.redirectTo('/sign-in');
Router.redirectTo('/sign-in', {
  replace: true,
  saveCurrentLocation: true,
});
Router.redirectToSaved({
  fallback: '/',
  replace: true,
});
Router.forbidden();
Router.notFound();
Router.error(error);
```

Configured policy:

```ts
new Route({
  canMatch: [
    RequireAuthenticatedSessionPolicy.configure().onFail(
      Router.redirectTo('/sign-in', {
        replace: true,
        saveCurrentLocation: true,
      }),
    ),
  ],
  load: () => import('@module/orders'),
});
```

Builder поддерживает:

```ts
Policy.configure().withOptions(options);
Policy.configure().onPass(handler);
Policy.configure().onFail(handler);
Policy.configure().onError(handler);
```

Handler может быть прямым `PolicyBoundaryDecision` или DI token, реализующим
`PolicyResultHandlerInterface`.

## Runtime Operation Flow

Route, frame и widget runtime выполняют loader/action/revalidate как runtime
operation. Operation возвращает внутренний результат:

```text
completed
  операция завершилась успешно

failed
  операция упала, lifecycle не изменился

interrupted
  операция устарела после смены runtime revision или session recovery

rejected
  transport получил ожидаемый HTTP 4xx result
```

Runtime revision сейчас даёт `SessionRuntimeStateInterface.revision`.

Если operation бросила ошибку после перехода session state, например
`authenticated -> anonymous`, это не считается exception для текущего
module/frame/widget. Это lifecycle interruption: старый поток больше не
является актуальным, а дальнейшее поведение должен определить route/session
flow.

Правила:

```text
completed
  применить result

failed
  оставить обычное error behavior: state failed, reporter, exception UI или
  submit error state в зависимости от runtime boundary

interrupted
  не показывать exception UI для старого runtime flow
  не записывать stale loader data
  не переводить widget/frame в failed из-за ожидаемого session transition

rejected
  не создавать RuntimeFailure и не отправлять failure report
  передать HTTP result ближайшему owner для локального представления
```

Route runtime при `interrupted` повторно применяет policies к текущему session
state. Protected branch может редиректить на sign-in через обычный
`Router.redirectTo(...)` policy handler.

Frame и widget runtime при `interrupted` сохраняют корректное локальное
состояние:

```text
load interrupted
  runtime возвращается в idle/неактивное состояние

revalidate interrupted
  текущие ready data остаются прежними

action interrupted
  action завершается без result и без exception UI
```

Этот механизм является internal framework contract. Feature-код не должен
создавать `RuntimeOperationResult` вручную и не должен ловить 401 в module,
widget или frame ради управления navigation.

## Runtime Errors

Runtime failure является внутренним результатом framework-owned operation. В
точке вызова framework автоматически сохраняет:

- owner: application, route, module, widget или frame;
- participant: initializer, policy, controller, provider или handler;
- operation: `execute`, `setup`, `loader`, `action`, `revalidate`, `dispose` и
  другие lifecycle phases.

Ближайший owner boundary принимает disposition: блокирует активацию, переводит
локальный runtime в `failed`, сохраняет активное состояние action/revalidate или
изолирует cleanup/event-handler failure. Только после этого формируется report.

Глобальной шины, class-подписок и view hooks для ручной публикации ошибок нет.
Feature-код использует обычные controller/provider contracts и показывает
локальные validation/action errors своим state-механизмом.

Abort, смена session revision и dispose являются interruption и не создают
failure report. `Response`, обработанный router/request contract, также не
превращается в runtime failure.

## HTTP Exceptions И Unauthorized Recovery

`HttpException<TResponse>` и стандартные status exceptions принадлежат
`@tiyn/app`. Domain transport adapter контролирует только преобразование
backend-specific payload в `TResponse`:

```ts
class TerminalConflictException extends ConflictException<TerminalErrorEntity> {}
```

Все HTTP-вызовы выполняются через application-scoped `RequestExecutorInterface`.
Для authenticated session первый `401` запускает single-flight recovery; другие
одновременные `401` ожидают тот же Promise. Composition root при необходимости
подключает только presentation-port:

```ts
@Injectable()
class SessionExpirationNotifier extends SessionExpirationNotifierInterface {
  constructor(@Inject(UserRequestServiceInterface) private readonly requests: UserRequestServiceInterface) {
    super();
  }

  notify(): Promise<void> {
    return this.requests.alert({
      title: 'Сессия завершена',
      description: 'Срок действия авторизации истёк. Выполните вход снова.',
      applyText: 'Ок',
    });
  }
}
```

После уведомления framework терминально останавливает запросы, начатые в
protected session, и переводит session в `anonymous`. Их promises намеренно не
возвращают rejection в feature/controller stack: значит широкий локальный
`catch` не увидит ни `UnauthorizedException`, ни служебную cancellation.

Session revision guard подписан на изменение state и завершает всё ещё pending
owner operation как `interrupted`. Initial load поэтому не показывает exception,
revalidate сохраняет ранее committed data, action не запускает локальную ветку
ошибки контроллера. Для anonymous session `401` не запускает recovery и остаётся
локальной ожидаемой ошибкой, например неверным логином.

Сохранение и восстановление текущего URL также принадлежит route policy
handlers:

```ts
RequireAuthenticatedSessionPolicy.configure().onFail(
  Router.redirectTo('/sign-in', {
    replace: true,
    saveCurrentLocation: true,
  }),
);

RequireAnonymousSessionPolicy.configure().onFail(
  Router.redirectToSaved({
    fallback: '/',
    replace: true,
  }),
);
```

Sign-in module не должен самостоятельно читать сохранённый URL и выполнять
дополнительный redirect после `session.setAuthenticated()`. Возврат на
сохранённый URL выполняется policy flow.

## Revalidate Runtime Entity

Revalidate - framework-level request на обновление active loader data ближайшей
runtime entity: module, frame или widget.

Используй revalidate, когда нужно обновить данные, загруженные controller
loader-ом текущей runtime entity.

Во view:

```tsx
export const OrdersView: React.FC = () => {
  const revalidate = useRevalidate();

  return (
    <button type="button" onClick={() => revalidate(OrdersController)}>
      Перезагрузить
    </button>
  );
};
```

В controller/service/provider:

```ts
@Provider()
export class RefreshOrdersProvider extends RuntimeProviderInterface {
  constructor(
    @Inject(RevalidateServiceInterface)
    private readonly revalidateService: RevalidateServiceInterface,
  ) {
    super();
  }

  async afterRender(): Promise<void> {
    await this.revalidateService.revalidate(OrdersController);
  }
}
```

Global revalidate:

```ts
await revalidateService.revalidate();
```

Targeted revalidate:

```ts
await revalidateService.revalidate(OrdersController);
```

Для module runtime внешний router adapter может перезапустить active route
loader. Feature code не должен зависеть от controller-level partial reload.

Владелец revalidate должен быть один. Если action controller сам вызывает
`RevalidateServiceInterface`, view не должен повторно вызывать
`useRevalidate()` для того же сценария без отдельной причины.

## Revalidate Widget

Widget controller получает тот же `RevalidateServiceInterface`, но binding
берётся из widget scope и обновляет widget-local loader data.

Во widget view:

```tsx
const revalidate = useRevalidate();

await revalidate();
```

В widget controller:

```ts
@Controller()
export class OrdersSummaryWidgetController extends OrdersSummaryWidgetControllerInterface {
  constructor(
    @Inject(RevalidateServiceInterface)
    private readonly revalidateService: RevalidateServiceInterface,
  ) {
    super();
  }

  async action(args: WidgetControllerActionArgs<OrdersSummaryWidgetProps, { readonly reason: string }>): Promise<void> {
    await this.revalidateService.revalidate({
      signal: args.signal,
    });
  }
}
```

## Revalidate Frame

Frame controller получает тот же `RevalidateServiceInterface`, но binding
берётся из frame scope и обновляет frame-local loader data.

Во frame view:

```tsx
const revalidate = useRevalidate();

await revalidate();
```

В frame controller:

```ts
@Controller()
export class OrderDetailsController extends OrderDetailsControllerInterface {
  constructor(
    @Inject(RevalidateServiceInterface)
    private readonly revalidateService: RevalidateServiceInterface,
  ) {
    super();
  }

  async action(args: FrameControllerActionArgs<OrderDetailsFrameParams, { readonly reason: string }>): Promise<void> {
    await updateOrder(args.props.id, args.payload.reason);
    await this.revalidateService.revalidate({
      signal: args.signal,
    });
  }
}
```

## Runtime Reporting

Runtime reporter принимает уже завершённые typed reports:

```ts
interface RuntimeFailureReport {
  readonly failure: RuntimeFailure;
  readonly disposition: RuntimeFailureDisposition;
  readonly ownerState: string;
  readonly reportedAt: number;
}
```

Failure содержит исходную cause, автоматически собранный source, стабильный id и
propagation hops. Строковых error codes и ручного восстановления source нет.

```ts
interface RuntimeFailureSource {
  readonly owner: RuntimeOwner;
  readonly participant: RuntimeParticipant;
  readonly operation: string;
}
```

Основные dispositions:

```text
application.activation-failed
route.activation-failed
module.activation-failed
widget.failed
frame.failed
action.failed
revalidate.failed
event-handler.contained
cleanup.contained
```

`interrupted` runtime operation не является reportable exception. Если
operation прервана из-за смены session revision, это expected lifecycle flow,
а не ошибка provider/controller/module.

## Reporter Sink

Output-only sink можно добавить через DI bindings:

```ts
export class AppRuntimeErrorBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(RuntimeFailureSinkInterface).to(AppRuntimeFailureSink).inSingletonScope();
  }
}
```

Sink не возвращает framework action и не управляет lifecycle state. Ошибка sink
изолируется fallback-reporting и не меняет исходный disposition. Если sink отправляет ошибки на
server endpoint, он не должен создавать recursion через тот же request pipeline.

## Exception UI

Exception UI уровня application настраивается через `app.components(...)`.

Route exception UI:

```ts
new Route({
  path: '/orders',
  exception: <OrdersExceptionView />,
  load: () => import('@module/orders'),
});
```

Route-level 404 UI:

```ts
new Route({
  path: '/orders',
  notFound: <OrdersNotFoundView />,
  load: () => import('@module/orders'),
});
```

Route-level 403 UI:

```ts
new Route({
  path: '/orders',
  forbidden: <OrdersForbiddenView />,
  load: () => import('@module/orders'),
});
```

`forbidden` и `notFound` наследуются вниз по route tree. Ближайший route-level
status UI переопределяет application-level status UI.

Module exception UI:

```tsx
@Module({
  exception: <OrdersExceptionView />,
  view: OrdersView,
})
export class OrdersModule {}
```

Exception component читает ошибку через `useException()`:

```tsx
export const OrdersExceptionView: React.FC = () => {
  const error = useException();

  return <pre>{String(error)}</pre>;
};
```

Frame runtime errors во время provider/controller startup показываются внутри
frame boundary через `@Frame.exception`. Если у frame нет собственного
`exception`, framework переиспользует exception активного route. Ошибка frame не
заменяет module/route UI и не переводит parent runtime в `failed`.
Exception component получает original cause через `useException()`.

Widget runtime использует ту же ownership-семантику: `widget.failed` завершает
только конкретный `WidgetHost`, включая widget внутри frame. Failure ребёнка не
распространяется вверх; переход или dispose родителя освобождает дочерние
runtimes как обычный lifecycle cascade.

Ошибки, классифицированные runtime operation flow как `interrupted`, не
попадают в exception UI.
