# Блокировка Навигации

`NavigationBlockerFeature` защищает route или frame от ухода, пока выполняется
заданное приложением условие. Типичный случай — форма с несохранёнными
изменениями.

Блокер отвечает только за навигацию. Подтверждение опасного действия без ухода
из текущего route/frame остаётся задачей обычного confirm-механизма.

## Подключение В Host Application

Host задаёт общую presentation один раз:

```tsx
import {
  Application,
  NavigationBlockerFeature,
  NavigationBlockerPresentation,
  type ApplicationConfiguratorInterface,
} from '@tiyn/app';

import { NavigationBlockerView } from './presentations/navigation-blocker';

const presentation = NavigationBlockerPresentation.define(NavigationBlockerView);

export class ManagementApplication extends Application {
  protected configure(app: ApplicationConfiguratorInterface): void {
    app.features([NavigationBlockerFeature.configure({ presentation })]);
  }
}
```

Presentation получает только состояние выполнения и два решения:

- `leave()` — разрешить ожидающий переход;
- `stay()` — отменить ожидающий переход;
- `inProcess` — не допускать повторного решения, пока переход завершается.

## Использование Во View

Для React-формы достаточно условия:

```tsx
const form = useForm<EmployeeEditFormValues>();

useBlocker(form.formState.isDirty);
```

Можно передать функцию, если условие нужно вычислять в момент перехода:

```tsx
useBlocker(() => form.formState.isDirty && !form.formState.isSubmitting);
```

Если подтверждение требуется при любом уходе из frame, условием служит обычное
значение `true`:

```tsx
useBlocker(true);
```

Пока view смонтирован, каждый уход из его frame boundary требует решения
пользователя.

Hook регистрирует блокер в ближайшей route/frame boundary и освобождает его при
unmount. Несколько регистраций одной boundary объединяются по правилу `OR`:
переход блокируется, если истинно хотя бы одно условие.

Локальную presentation задают только когда конкретному месту действительно
нужно другое визуальное представление:

```tsx
const EmployeeEditBlockerPresentation = NavigationBlockerPresentation.define(EmployeeEditBlockerView);

useBlocker(form.formState.isDirty, {
  presentation: EmployeeEditBlockerPresentation,
});
```

Условие не содержит текст, `reason` или конфигурацию диалога. Визуальный
контракт принадлежит presentation.

## Использование В Controller

Controller может зарегистрировать условие через scoped service:

```ts
@Controller()
export class EmployeeEditController implements EmployeeEditControllerInterface {
  private readonly blockerRegistration: NavigationBlockerRegistration;

  constructor(
    @Inject(NavigationBlockerServiceInterface)
    private readonly navigationBlocker: NavigationBlockerServiceInterface,
  ) {
    this.blockerRegistration = this.navigationBlocker.register(() => this.store.hasUnsavedChanges);
  }

  dispose(): void {
    this.blockerRegistration.dispose();
  }
}
```

Регистрация из controller должна освобождаться вместе с controller. Для
состояния React-формы предпочтителен `useBlocker`, потому что hook уже связан с
жизненным циклом view.

## Разрешённый Переход После Сохранения

Успешное сохранение часто завершает тот же frame, который защищает блокер.
Такой переход нужно выполнить через `allow`:

```ts
await this.navigationBlocker.allow(() => this.navigate.back());
```

`allow` разрешает только переход, инициированный переданной операцией, и не
отключает последующие проверки. Ошибка сохранения не требует `allow`: route или
frame остаётся активным.

## Границы Блокировки

Блокер привязан к ближайшей runtime boundary:

| Текущая boundary | Переход                                        | Результат            |
| ---------------- | ---------------------------------------------- | -------------------- |
| Route            | В другой экземпляр route или за его пределы    | Проверить условие    |
| Route            | Открыть/закрыть frame над тем же route         | Не блокировать route |
| Frame            | Закрыть frame или перейти в другой frame route | Проверить условие    |
| Frame            | Изменить только search текущего frame route    | Не считать уходом    |

Независимые `FrameRouter` имеют разные boundary даже при одинаковом frame path.

## Browser Back И Закрытие Вкладки

Переходы через browser back/forward проходят через тот же blocker runtime, что
и вызовы `NavigateServiceInterface`. Если пользователь открывает edit-frame по
прямой ссылке, попытка уйти назад также проверяет условие.

Транспорт выбирается framework автоматически:

- при наличии Navigation API с pre-commit поддержкой `traverse` удерживается до
  решения пользователя, поэтому URL не меняется и не мерцает;
- если pre-commit недоступен или конкретный переход нельзя перехватить,
  используется blocker React Router с тем же функциональным поведением, но
  browser `POP` может кратковременно применить и откатить URL;
- программные `push`/`replace` остаются на blocker React Router, который
  проверяет их до изменения URL.

Application code не определяет поддержку браузера и одинаково использует
`useBlocker` или `NavigationBlockerServiceInterface` в обоих режимах.

При закрытии или перезагрузке вкладки используется нативный `beforeunload`.
Браузер сам управляет текстом системного предупреждения; framework не может
подменить его host presentation.

## Ограничения Контракта

- Feature не зависит от `UserRequestFeature` и не переиспользует его dialogs.
- Blocker не перехватывает submit или action автоматически.
- Blocker не описывает причины и не выбирает business-specific текст.
- Router adapter и blocker runtime являются внутренними деталями; application
  code использует `useBlocker` или `NavigationBlockerServiceInterface`.
