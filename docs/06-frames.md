# Фреймы

Frame — presentation runtime поверх текущего route screen: drawer, modal,
инспектор или detail panel. Сам Frame не знает URL, hash, shell и соседние
фреймы. Его доступностью и навигацией управляет отдельное дерево
`FrameRouter`/`FrameRoute`.

```text
обычный Router выбирает активную Route-ветку
  -> Route.frames предоставляет доступные FrameRouter
    -> hash сопоставляется с одним FrameRoute
      -> FrameRoute лениво загружает Frame
        -> FrameRouter shell отображает Frame runtime
```

Standalone frames и открытие по class token не поддерживаются. Каждый Frame
должен загружаться через `FrameRoute`, каждый `FrameRoute` должен находиться в
`FrameRouter`, а `Route.frames` принимает только `FrameRouter`.

## Глобальная Конфигурация

Если дерево обычных routes содержит хотя бы один `FrameRouter`, приложение
обязано настроить общий shell:

```tsx
protected configure(app: ApplicationConfiguratorInterface): void {
  app.components({
    fallback: <ApplicationFallback />,
    exception: <ApplicationException />,
    forbidden: <ApplicationForbidden />,
    notFound: <ApplicationNotFound />,
  });

  app.frames({
    shell: ManagementPanelFrameShell,
  });

  app.router(router);
}
```

У `app.frames(...)` обязателен только `shell`. Неуказанные `fallback`,
`exception`, `forbidden` и `notFound` наследуются из `app.components(...)`.
Порядок вызовов `app.components(...)` и `app.frames(...)` не влияет на
результат.

При необходимости frame runtime может иметь отдельные глобальные границы:

```tsx
app.frames({
  shell: ManagementPanelFrameShell,
  fallback: <FrameFallback />,
  exception: <FrameException />,
  forbidden: <FrameForbidden />,
  notFound: <FrameNotFound />,
});
```

При первом входе или перезагрузке по URL с активным frame hash application
router начинает route/module и frame цепочки одновременно. Общий application
`splash` остаётся видимым, пока не готовы обе цепочки, включая widget preload
из их providers. Обе цепочки продолжаются только после успешных
`canMatch`/`canActivate` целевой обычной Route-ветки: frame preload не обходит
route access-policy. Frame не ждёт render Module, чтобы начать загрузку.

После первого render, при обычном переходе между frame routes, используется
frame `fallback`, а не application `splash`.

## Declaration Фрейма

```tsx
@UseBindings(EmployeeReviewBindings)
@Frame({
  layouts: [EmployeeReviewLayout],
  providers: [EmployeeReviewPreloadProvider],
  fallback: <EmployeeReviewFallback />,
  exception: <EmployeeReviewException />,
  view: FrameView,
})
export class EmployeeReviewFrame {}
```

Frame declaration не несёт параметры маршрута: они принадлежат активному
`FrameRoute`. Controller получает их через `args.params`, а view при
необходимости — через общий `useParams<TParams>()`.

Metadata `@Frame` содержит только собственный runtime-контракт:

```ts
interface FrameMetadata {
  readonly exception?: React.ReactNode;
  readonly fallback?: React.ReactNode;
  readonly layouts?: readonly LayoutConstructor[];
  readonly providers?: readonly ProviderToken[];
  readonly view: RenderableView;
}
```

В `@Frame` нет `source`, `shell`, policies и routing-конфигурации. Frame package
не должен импортировать соседние frame tokens и управлять переходами между ними.

## FrameRouter И FrameRoute

`FrameRouter` задаёт общий URL-префикс и оркестрирует связный flow. Например,
просмотр и редактирование сотрудника:

```ts
const EmployeeFrameRouter = new FrameRouter({
  baseSource: 'employees/:employeeId',
  routes: [
    new FrameRoute({
      load: () => import('@frame/employee-review'),
    }),
    new FrameRoute({
      path: 'edit',
      load: () => import('@frame/employee-edit'),
    }),
  ],
});
```

Получаются абсолютные frame sources:

```text
/employees/42
/employees/42/edit
```

`FrameRoute` без `path` является индексным маршрутом относительно
`baseSource`. Вложенные `FrameRoute` позволяют строить дерево и задавать
`defaultTo`:

```ts
new FrameRouter({
  baseSource: 'terminals/:terminalId',
  routes: [
    new FrameRoute({
      defaultTo: 'review',
      routes: [
        new FrameRoute({
          path: 'review',
          load: () => import('@frame/terminal-review'),
        }),
        new FrameRoute({
          path: 'edit',
          load: () => import('@frame/terminal-edit'),
        }),
      ],
    }),
  ],
});
```

`load` должен лениво вернуть module export с одним `@Frame` class. Сам
`FrameRoute` не импортирует этот class синхронно.

`FrameRouter` и `FrameRoute` поддерживают framework-композицию:

- `canMatch` и `canActivate`;
- `providers`;
- `layouts`;
- `fallback`, `exception`, `forbidden`, `notFound`;
- `shell` на уровне `FrameRouter`;
- `defaultTo` и вложенные routes на уровне `FrameRoute`.

## Доступность От Обычного Route

Каждый `FrameRouter` подключается на том уровне обычного route tree, где его
фреймы должны быть доступны:

```ts
new Route({
  path: '/employees',
  canMatch: [AccessToSection.configure().withOptions(['employees'])],
  frames: [
    new FrameRouter({
      baseSource: 'employees/invitations/create',
      routes: [
        new FrameRoute({
          load: () => import('@frame/employee-invitation-create'),
        }),
      ],
    }),
  ],
  layouts: [EmployeesLayout],
  routes: [
    new Route({
      frames: [
        new FrameRouter({
          baseSource: 'employees/:employeeId',
          routes: [
            new FrameRoute({ load: () => import('@frame/employee-review') }),
            new FrameRoute({ path: 'edit', load: () => import('@frame/employee-edit') }),
          ],
        }),
      ],
      load: () => import('@module/employees'),
    }),
    new Route({
      path: '/invitations',
      frames: [
        new FrameRouter({
          baseSource: 'employees/invitations/:invitationId',
          routes: [new FrameRoute({ load: () => import('@frame/employee-invitation-review') })],
        }),
      ],
      load: () => import('@module/employee-invitations'),
    }),
  ],
});
```

Правило доступности совпадает с обычным router tree:

- `FrameRouter` родительского `Route` доступен всей активной дочерней ветке;
- `FrameRouter` конкретного child `Route` доступен только в этой ветке;
- runtime и scope router-а принадлежат именно тому `Route`, где router объявлен;
- переход на hash, недоступный текущей route-ветке, не открывает Frame.

На одном уровне можно объявить несколько независимых `FrameRouter`. Переход
между ними ничем не отличается от перехода внутри одного flow.

## Shell

Shell является общей внешней оболочкой: overlay, drawer/modal chrome, кнопки
закрытия и возврата.

```tsx
@FrameShell()
export class ManagementPanelFrameShell implements FrameShellInterface {
  render({ close, content, open }: FrameShellContextInterface): React.ReactNode {
    return (
      <Drawer open={open} onClose={close}>
        {content}
      </Drawer>
    );
  }
}
```

Разрешение shell:

```text
FrameRouter.shell
  -> app.frames.shell
```

Локальный `FrameRouter.shell` заменяет глобальный shell для всего flow.
`@Frame` собственного shell не имеет.

## Навигация

Для React-кода:

```tsx
const navigate = useNavigate();

await navigate.frame.open('/employees/42');
await navigate.frame.open('/employees/42/edit');
await navigate.frame.close();
```

Для controller или service используется тот же контракт через DI:

```ts
@Controller()
export class EmployeeReviewController implements EmployeeReviewControllerInterface {
  constructor(
    @Inject(NavigateServiceInterface)
    private readonly navigate: NavigateServiceInterface,
  ) {}

  async edit(employeeId: string): Promise<void> {
    await this.navigate.frame.open(`/employees/${employeeId}/edit`);
  }
}
```

`frame.open()` принимает абсолютный source, начинающийся с `/`. Относительные
значения вроде `frame.open('edit')` запрещены: одинаковый вызов должен сохранять
смысл при переходе между независимыми frame routers.

`frame.close()` создаёт обычную history entry без активного frame route.
Благодаря этому история остаётся полноценной:

```text
открыть frame 1 -> закрыть -> открыть frame 6 -> закрыть
browser back    -> frame 6 -> закрыто -> frame 1 -> закрыто
```

Для закрытия без отдельной записи передай `{ replace: true }`.

Возврат по browser history выполняется `NavigateServiceInterface.back()` либо
средствами браузера. Framework не пытается
выводить родителя из распределённых `FrameRouter`/`FrameRoute` declarations и
не подменяет отсутствующую history entry синтетическим переходом. Если
конкретному экрану нужна кнопка на известный URL, это явная feature navigation.

Не изменяй hash вручную через `window.location` или React Router. Используй
`NavigateServiceInterface.frame`; отдельного injectable frame navigation service
и отдельной frame history metadata нет.

## Params И Controller

Динамические сегменты `baseSource` и `path` становятся props фрейма. Значения
URL-сегментов являются строками:

```ts
type EmployeeReviewControllerArgs = ControllerArgs<WithProps<{ readonly employeeId: string }>>;

export abstract class EmployeeReviewControllerInterface {
  abstract loader(args: EmployeeReviewControllerArgs): Promise<EmployeeEntity>;
}

@Controller()
export class EmployeeReviewController implements EmployeeReviewControllerInterface {
  constructor(
    @Inject(EmployeeServiceInterface)
    private readonly employeeService: EmployeeServiceInterface,
  ) {}

  loader({ props, signal }: EmployeeReviewControllerArgs): Promise<EmployeeEntity> {
    return this.employeeService.get(props.employeeId, { signal });
  }
}
```

Controller получает params через единый `ControllerArgs<WithProps<...>>`.
Нельзя повторно читать hash/location и разбирать source внутри controller или
view.

Frame использует общие controller hooks:

```tsx
const employee = useLoaderData(EmployeeReviewControllerInterface);
const submit = useSubmit(EmployeeReviewControllerInterface);
const controller = useController(EmployeeReviewControllerInterface);
const revalidate = useRevalidate(EmployeeReviewControllerInterface);
```

Обычная ошибка `action` остаётся в `submit.error`. Для принудительного перевода
frame runtime в `failed` controller вызывает внедрённый
`RuntimeExceptionServiceInterface.raise(error)`.

## Providers И Layouts

Порядок композиции:

```text
FrameRouter shell
  -> FrameRouter layouts
    -> FrameRoute layouts от корня к листу
      -> Frame layouts
        -> Frame view
```

Router-level providers живут весь срок активного router runtime. Providers
ветки `FrameRoute` пересоздаются при переходе на другой leaf. Frame providers
принадлежат конкретному Frame runtime.

Provider используется для lifecycle side effects: preload, subscription,
подключение внешнего runtime. Загрузка данных и пользовательские команды
принадлежат controller.

## Границы Ошибок

Для routing-stage (`load` Frame export, policies, router/route providers)
граница выбирается так:

```text
ближайший FrameRoute
  -> FrameRouter
    -> app.frames
      -> app.components
```

После создания Frame его собственные `fallback` и `exception` являются самой
близкой runtime-границей. Ошибка loader/action/render конкретного Frame остаётся
внутри Frame runtime и не переводит обычный Route или всё приложение в
`failed`. Ошибка shell либо router-level layout принадлежит `FrameRouter`.

## Чеклист

- Frame не содержит `source` и `shell`.
- `Route.frames` содержит только `FrameRouter`.
- Каждый `FrameRoute` находится внутри `FrameRouter`.
- `app.frames({ shell })` настроен, если используются frame routers.
- Переходы используют только абсолютный `to('/...')`.
- Frame package не импортирует соседние frame tokens.
- Params приходят в controller через `props`.
- Browser back, shell back и close проверены для прямого URL и history flow.
- Lazy-load, forbidden, not-found и render errors остаются в frame layer.
