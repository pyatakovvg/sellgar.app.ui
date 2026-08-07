# Фреймы

Frame - presentation runtime, активируемый через source. Типичный сценарий:
hash-driven drawer или modal. При этом `@tiyn/app` не вводит отдельные runtime
понятия drawer/modal, а описывает их как frame + shell.

```text
Frame
  runtime definition

Source
  adapter активации и команд

Shell
  визуальный контейнер

View
  runtime content inside shell
```

## Когда Использовать Frame

Используй frame, если UI должен открываться поверх текущего route:

- drawer;
- modal;
- side panel;
- inspector;
- detail view, который должен сохраняться в URL hash.

Frame подходит, когда open/close должны быть command API, а active state должен
определяться source, например hash.

Не используй frame как замену основного route screen. Если пользователь
переходит на самостоятельный экран, нужен route module.

## Declaration Фрейма

```ts
export class OrderDetailsFrameParams {
  @Expose()
  readonly id!: string;
}
```

```tsx
@UseBindings(OrderDetailsBindings)
@Frame<OrderDetailsFrameParams>({
  source: HashFrameSource.create('order-details', OrderDetailsFrameParams),
  shell: OrderDetailsFrameShell,
  layouts: [OrderDetailsLayout],
  providers: [OrdersSummaryWidgetPreloadProvider],
  fallback: <p>Фрейм загружается...</p>,
  exception: <p>Фрейм не загрузился</p>,
  view: FrameView,
})
export class OrderDetailsFrame extends FrameDefinition<OrderDetailsFrameParams> {}
```

`FrameDefinition<TProps>` нужен для типизации token. Благодаря этому
`useFrame(...)` и `FrameServiceInterface` знают, какие props нужны для
`open(...)`.

Metadata frame:

```ts
interface FrameMetadata<TProps extends object = object> {
  readonly exception?: React.ReactNode;
  readonly fallback?: React.ReactNode;
  readonly layouts?: readonly LayoutConstructor[];
  readonly providers?: readonly DependencyToken<RuntimeProviderInterface>[];
  readonly shell?: DependencyToken<FrameShellInterface>;
  readonly source?: FrameSourceInterface<TProps>;
  readonly view: RenderableView<TProps>;
}
```

Frame controllers объявляются не в metadata, а через `@Controller()` на concrete
implementation и frame-local bindings. `providers` описывают lifecycle side
effects вокруг загрузки frame runtime. Не подменяй controller provider-ом, если
задача состоит в загрузке данных или обработке action.

## Layouts Фрейма

Frame может использовать те же `@Layout(...)`, что route runtime:

```text
FrameShell
-> layouts[]
-> Frame view
```

`shell` отвечает за внешний контейнер frame: drawer/modal/overlay, close/open
mechanics и presentation chrome. `layouts` отвечают за внутреннюю композицию:
header, footer, tabs, toolbar, spacing и preload providers для вложенных widget
runtime.

Порядок `layouts: [A, B]` совпадает с route layouts:

```tsx
<A>
  <B>
    <FrameView />
  </B>
</A>
```

Layout bindings активируются в `FrameScope`. Layout providers добавляются в
frame provider pipeline после frame-level providers.

Layout во frame не становится владельцем frame data contract. Loader result,
action payloads и DTO остаются у frame controller. Layout может читать данные
через `useLoaderData(...)` или submit state через `useSubmit(...)`,
если это нужно для header, footer или controls.

## Подключение Frame К Route

Frames объявляются на route и наследуются child routes.

```ts
new Route({
  path: '/',
  frames: [OrderDetailsFrame],
  layouts: [MainLayout],
  routes: [
    new Route({
      path: '/orders',
      load: () => import('@module/orders'),
    }),
  ],
});
```

`OrderDetailsFrame` будет доступен на `/orders`.

Layouts не должны рендерить frame hosts. `Application.createView()`
устанавливает `FrameLayer` глобально.

## HashFrameSource

`HashFrameSource` связывает frame с hash key:

```ts
HashFrameSource.create('order-details', OrderDetailsFrameParams);
```

Активный URL:

```text
/orders#order-details(id='100')
```

Открытие без props создает hash flag:

```text
/orders#order-details
```

Source resolve-ит:

- active state;
- props;
- runtime key;
- close handler.

Runtime key строится по raw hash value. Поэтому изменение hash props remount-ит
frame runtime.

`RouterRuntime.resolveActiveFrames(...)` возвращает максимум один активный
frame. Если в hash вручную оказалось несколько frame keys, runtime выбирает
последний доступный frame из текущей route branch, а `FrameLayer` рендерит
полученный active frame runtime.

`FrameService.open(...)` заменяет текущий frame следующим и очищает остальные
активные frame keys. Если `open(...)` вызван из runtime scope активного frame,
текущий frame сохраняется как parent во внутренней frame-history. URL хранит
только текущий frame:

```text
/orders#incident-review(id='INC-1')
```

Frame-history хранится в `sessionStorage` через внутренний модуль
`frame-navigation-state`. Область ключа storage задается `router.baseUrl`, поэтому
несколько приложений на одном домене не делят frame-history.

`history.state` не используется для frame-history: он не является источником
истины и не участвует в восстановлении parent chain.

Frame commands:

- `open(...)` открывает frame. Из активного frame он добавляет текущий frame в
  parent stack.
- `back()` возвращает предыдущий frame из parent stack. Если parent нет,
  закрывает текущий frame.
- `close()` закрывает всю frame-сессию и очищает parent stack.
- `hasParent()` показывает, есть ли доступный parent frame для текущего active
  frame runtime.

При reload URL остается адресуемым состоянием текущего frame, а
`sessionStorage` восстанавливает историю открытия вокруг него. Если сохраненный
`current` не совпадает с текущим hash key и props, frame-history считается
stale и очищается. В этом случае frame работает как direct link без parent.

## Shell

Shell определяет визуальное представление: drawer, modal, dialog, fullscreen и
любой другой контейнер. `@tiyn/app` не зависит от конкретного UI kit.

```tsx
@Injectable()
export class OrderDetailsFrameShell extends FrameShellInterface {
  render(context: FrameShellContextInterface): React.ReactNode {
    return (
      <aside aria-hidden={!context.open}>
        <button type="button" onClick={() => context.close()}>
          Закрыть
        </button>
        {context.content}
      </aside>
    );
  }
}
```

Shell context:

```ts
interface FrameShellContextInterface {
  readonly back: () => void | Promise<void>;
  readonly close: () => void | Promise<void>;
  readonly content: React.ReactNode;
  readonly open: boolean;
}
```

Shell close controls, overlay click и Escape должны вызывать `context.close()`,
потому что это закрытие всей frame-сессии. Кнопки "Назад" внутри view или
controller должны вызывать `frameService.back()`.

## View Фрейма

Frame view получает props из source.

```tsx
export const FrameView: React.FC<OrderDetailsFrameParams> = (props) => {
  return <OrderDetailsView id={props.id} />;
};
```

`view` принимает `RenderableView<TProps>`:

```tsx
view: FrameView;
view: <FrameView id="100" />;
view: (props) => <FrameView {...props} />;
```

Предпочтительная форма - `view: FrameView`.

## Frame Controller

Frame controller похож на widget controller: он работает внутри конкретного
frame runtime instance и получает props из frame source.

```ts
export interface OrderDetailsFrameData {
  readonly loadedAt: string;
  readonly status: string;
}

export interface ConfirmOrderPayload {
  readonly reason: string;
}

export interface ConfirmOrderResult {
  readonly accepted: boolean;
}
```

```ts
import { FrameControllerInterface, type FrameControllerActionArgs, type FrameControllerLoaderArgs } from '@tiyn/app';

export abstract class OrderDetailsControllerInterface extends FrameControllerInterface<OrderDetailsFrameParams> {
  abstract loader(args: FrameControllerLoaderArgs<OrderDetailsFrameParams>): Promise<OrderDetailsFrameData>;

  abstract action(
    args: FrameControllerActionArgs<OrderDetailsFrameParams, ConfirmOrderPayload>,
  ): Promise<ConfirmOrderResult>;
}
```

```ts
import { Controller } from '@tiyn/app';

@Controller()
export class OrderDetailsController extends OrderDetailsControllerInterface {
  async loader(args: FrameControllerLoaderArgs<OrderDetailsFrameParams>): Promise<OrderDetailsFrameData> {
    return {
      loadedAt: new Date().toISOString(),
      status: `Order ${args.props.id} loaded`,
    };
  }

  async action(
    args: FrameControllerActionArgs<OrderDetailsFrameParams, ConfirmOrderPayload>,
  ): Promise<ConfirmOrderResult> {
    await confirmOrder(args.props.id, args.payload.reason);

    return {
      accepted: true,
    };
  }
}
```

`FrameControllerLoaderArgs<TProps>` содержит:

- `props` - props, полученные из `FrameSourceInterface`;
- `params` - route params активного route location;
- `request` - request, собранный по текущему location;
- `signal` - abort signal текущего frame lifecycle.

`FrameControllerActionArgs<TProps, TPayload>` дополнительно содержит
`payload`.

Controller должен быть помечен `@Controller()` и привязан в frame bindings:

```ts
export class OrderDetailsBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(OrderDetailsControllerInterface).to(OrderDetailsController).inSingletonScope();
  }
}
```

## Hooks Во Frame View

Frame view читает frame runtime через frame hooks:

```tsx
export const FrameView: React.FC<OrderDetailsFrameParams> = () => {
  const data = useLoaderData(OrderDetailsControllerInterface);
  const submit = useSubmit(OrderDetailsControllerInterface);
  const revalidate = useRevalidate();

  return (
    <section>
      <p>{data.status}</p>
      <button disabled={submit.inProcess} type="button" onClick={() => submit({ reason: 'manual' })}>
        Подтвердить
      </button>
      <button disabled={revalidate.inProcess} type="button" onClick={() => revalidate()}>
        Обновить
      </button>
    </section>
  );
};
```

Доступные hooks:

```ts
useController(OrderDetailsControllerInterface);
useLoaderData(OrderDetailsControllerInterface);
useSubmit(OrderDetailsControllerInterface);
useRevalidate();
```

`useSubmit(...)` возвращает function со state:

```ts
submit.inProcess;
submit.data;
submit.error;
```

Submit state общий для активного frame runtime и controller token. Несколько
вызовов `useSubmit(...)` для одного controller в одном frame instance
читают один `inProcess`, `data` и `error`.

Один controller token в одном frame runtime может держать только один pending
submit. Повторный вызов из любого hook instance во время active submit вернет
rejected promise.

`useRevalidate()` возвращает function со state:

```ts
revalidate.inProcess;
revalidate.error;
```

Ошибки submit/revalidate остаются recoverable в hook state и не переводят
frame runtime в `failed`.

## Revalidate Frame

Frame revalidate обновляет только данные активного frame runtime. Он не
перезапускает route/module loader и не обновляет вложенные widgets.

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

  async action(
    args: FrameControllerActionArgs<OrderDetailsFrameParams, ConfirmOrderPayload>,
  ): Promise<ConfirmOrderResult> {
    await confirmOrder(args.props.id, args.payload.reason);
    await this.revalidateService.revalidate({
      signal: args.signal,
    });

    return {
      accepted: true,
    };
  }
}
```

Используй `RevalidateServiceInterface`, когда revalidate является частью
frame action. Внутри frame scope этот token обновляет active frame runtime.
Используй `useRevalidate()`, когда revalidate запускает сам пользовательский UI.

## Открытие Frame Из React

Во view используй `useFrame(frameToken)`.

```tsx
export const OrdersView: React.FC = () => {
  const orderDetailsFrame = useFrame(OrderDetailsFrame);

  return (
    <button type="button" onClick={() => orderDetailsFrame.open({ id: '100' })}>
      Открыть детали
    </button>
  );
};
```

Возврат к parent frame:

```tsx
await orderDetailsFrame.back();
```

Закрытие всей frame-сессии:

```tsx
await orderDetailsFrame.close();
```

Frame без обязательных props можно открыть без аргументов:

```tsx
const helpFrame = useFrame(HelpFrame);

await helpFrame.open();
```

## Открытие Frame Из Controller Или Service

Runtime-код использует `FrameServiceInterface`.

```ts
@Controller()
export class OpenOrderDetailsController implements ControllerInterface {
  constructor(
    @Inject(FrameServiceInterface)
    private readonly frameService: FrameServiceInterface,
  ) {}

  async action(args: ControllerActionArgs<{ readonly id: string }>): Promise<void> {
    await this.frameService.open(OrderDetailsFrame, {
      id: args.payload.id,
    });
  }
}
```

Возврат к parent frame:

```ts
await this.frameService.back(OrderDetailsFrame);
```

Закрытие всей frame-сессии:

```ts
await this.frameService.close(OrderDetailsFrame);
```

Потребители не должны знать hash key. Hash key принадлежит `HashFrameSource` в
definition.

## Providers Фрейма

Frame metadata может объявлять providers:

```tsx
@Frame<OrderDetailsFrameParams>({
  source: HashFrameSource.create('order-details', OrderDetailsFrameParams),
  shell: OrderDetailsFrameShell,
  providers: [OrdersSummaryWidgetPreloadProvider],
  fallback: <p>Фрейм загружается...</p>,
  view: FrameView,
})
export class OrderDetailsFrame extends FrameDefinition<OrderDetailsFrameParams> {}
```

Frame providers помечаются `@Provider()`, используют
`RuntimeProviderInterface` и выполняются в `FrameScope`.

Это позволяет preload-ить widgets или подключать lifecycle effects, не
перенося orchestration code во frame view.

Frame provider lifecycle:

```text
beforeLoad
-> frame controller loaders
-> beforeRender
-> frame layouts
-> frame view render
```

Provider может подготовить вложенный widget через
`WidgetRuntimeFactoryInterface.preload(...)`. Данные самого frame должны
загружаться controller-ом.

## Поведение При Старте

Прямое открытие страницы с active hash:

```text
/orders#order-details(id='100')
-> route branch matches
-> available frames собираются из matched route branch
-> active frame runtime подготавливается во время loader flow текущего leaf route
-> FrameLayer renders prepared frame
```

Это правило действует на любой глубине route tree и с настроенным `baseUrl`:
canonical pathname дочернего route включает все parent segments, поэтому
providers и controller loaders активного frame завершаются до разрешения route
loader и скрытия startup splash.

Активация только через hash после render страницы:

```text
user открывает frame
-> hash changes
-> route loaders не revalidate-ятся автоматически
-> FrameLayer starts frame runtime
-> frame fallback renders while providers run
```

Если frame runtime падает при resolution provider/controller, во время
`beforeRender` или React render, `FrameLayer` показывает `@Frame.exception`.
Render failure публикуется с `operation: 'render'`; ошибка frame view остаётся
внутри frame shell и не заменяет module UI. Если собственного `exception` нет,
используется ближайший route/application exception UI.
