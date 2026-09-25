# Application Feature

Статус: current.

Feature — application-level роль, которая добавляет приложению сквозную
функциональность. Feature объявляется классом, участвует в DI и подключается в
`app.features(...)`. Она не является конфигурационным объектом, provider или
базовым классом.

Core владеет lifecycle-контрактом `ApplicationFeatureInterface`. Renderer-срезы
добавляют в `@Feature()` необязательные `wrapper` и `presentation`.

## Декларация

```tsx
import { Inject, UseBindings, type ApplicationFeatureInterface } from '@sellgar/app';
import { Feature } from '@sellgar/app/fsm';

@UseBindings(FeatureBindings)
@Feature({
  wrapper: FeatureView,
  presentation: {
    layer: 'application',
    view: <FeaturePresentation />,
  },
})
export class CustomFeature implements ApplicationFeatureInterface {
  constructor(
    @Inject(FeatureServiceInterface)
    private readonly service: FeatureServiceInterface,
  ) {}

  initialize(): () => void {
    return this.service.synchronize();
  }
}

// В configure приложения:
app.features([CustomFeature]);
```

`@Feature()` одновременно объявляет роль feature и делает класс доступным DI.
`@UseBindings()` принадлежит тому же узлу и активируется до создания экземпляра,
поэтому constructor injection работает без промежуточного provider.
Один token-класс регистрируется в приложении только один раз.

Feature может реализовать:

- `initialize({ signal })` — запуск собственной подписки или процесса;
- cleanup, возвращённый `initialize`, — остановку этого процесса;
- `dispose()` — финальное освобождение ресурсов экземпляра.

Наследование от framework-класса и `super(...)` не используются. Lifecycle
реализуется напрямую через интерфейс.

## Конфигурация встроенных features

React и Native предоставляют `UserRequestFeature.configure(options)`,
`NotificationFeature.configure(options)` и
`NavigationBlockerFeature.configure(options)`. Результат передаётся в
`app.features(...)`:

```tsx
app.features([
  UserRequestFeature.configure({ presentation: userRequestPresentation }),
  NotificationFeature.configure({ presentation: notificationPresentation }),
  NavigationBlockerFeature.configure({ presentation: blockerPresentation }),
]);
```

Каждый вызов возвращает отдельный token-класс с `@Feature()` и `@UseBindings()`.
Конфигурация не изменяет общий класс и не создаёт runtime-экземпляр: создание,
DI и lifecycle остаются в core. Настройки задаются при конфигурации приложения,
а не при render. Отдельные функции `create…Feature` не экспортируются.

## Rendering

- `wrapper` получает `children`, а не DOM root и не управление приложением.
- Первый wrapper в `app.features(...)` является внешним.
- Wrappers охватывают splash, layouts, экран, fallback, application errors и
  application/modal/notification layers.
- `presentation` появляется в фазе `ready` на слое `application`, `modal` или
  `notification`. Слой `frame` принадлежит роутеру.
- Feature без rendering metadata может владеть только bindings и lifecycle.
- Metadata неизменяема и принадлежит token-классу, а runtime-состояние —
  экземпляру feature в application scope.

Feature с controller bindings или lifecycle подготавливается до router bridge.
Декларативная feature без controllers и lifecycle может оборачивать splash сразу.

## Controllers и lifecycle

Bindings всех feature активируются в application scope до разрешения их
экземпляров. Найденные `@Controller()` работают через общий application-level
controller runtime, поэтому `useLoaderData`, `useSubmit` и `useController`
остаются доступны из layouts, modules и widgets.

Порядок запуска:

1. application initializers;
2. `feature.initialize()`;
3. feature controller loaders;
4. router bridge;
5. application ready.

Feature не должна ждать первый router snapshot внутри startup. Подписка должна
возвращать cleanup и продолжать работу самостоятельно.

При освобождении сначала останавливаются controller operations и controllers,
затем в обратном порядке выполняются feature cleanup и `dispose()`. Частично
инициализированные feature также освобождаются. Ошибка одной feature не оставляет
подписки уже запущенных feature.

## Ошибки

Ошибки lifecycle получают participant `feature` и проходят через application
reporting. Ошибка initialize не позволяет запустить router. Ошибки cleanup
репортятся как contained и не останавливают освобождение остальных ресурсов.

Внутренняя runtime boundary сохраняет feature contexts при ошибке содержимого.
Внешняя boundary исключает сломанный wrapper из аварийного дерева, поэтому
application failed view обязана уметь отрисоваться без feature context.

## Проверки

`application-feature-lifecycle.test.tsx` проверяет общий контракт React/FSM/Native:
DI, wrappers, presentation layers, controller ownership, ошибки, cleanup,
StrictMode и изоляцию приложений.

`contracts/application-feature.fixture.tsx` проверяет public API и запрет
feature-owned frame presentation.
