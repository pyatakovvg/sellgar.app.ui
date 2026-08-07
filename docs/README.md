# Руководство Разработчика `@tiyn/app`

Эта папка описывает внешнее API `@tiyn/app`: как объявлять приложение,
маршруты, модули, контроллеры, провайдеры, виджеты и фреймы.

Документация фиксирует только реализованные контракты. Если идея есть в
архитектурном драфте, но отсутствует в текущем API `@tiyn/app`, она здесь
не описывается как рабочий механизм.

Документы размещены внутри пакета `library/tiyn-app` и сверены с текущим
`src/index.ts` 2026-07-28. Результат сверки:
[Аудит Public API](./17-public-api-audit.md).

## Для Кого Этот Документ

Документ нужен разработчику, который пишет код фич поверх `@tiyn/app`:

- добавляет route module;
- подключает controller loader/action;
- читает loader data во view;
- делает navigation или revalidate;
- подключает reusable widget;
- preload-ит widget из module или frame provider;
- открывает frame из view или controller;
- добавляет bindings через framework DI facade.

## Как Читать

Если ты впервые работаешь с `@tiyn/app`, начни с первых двух разделов. Они
объясняют владение runtime и порядок запуска. Остальные разделы можно читать по
задаче.

Для очного обучения и презентации используй отдельный
[курс для преподавателя](./training/README.md). Он вводит понятия поступательно,
начиная с `Hello World`, и использует эту папку как технический источник, а не
как порядок показа материала аудитории.

### Быстрый Вход

- [Быстрый старт](./00-quick-start.md)
- [Аудит Public API](./17-public-api-audit.md)
- [Что получится](./00-quick-start.md#что-получится)
- [Минимальная структура](./00-quick-start.md#минимальная-структура)
- [Controller tokens](./00-quick-start.md#1-controller-tokens)
- [Module declaration](./00-quick-start.md#5-module-declaration)
- [Module view](./00-quick-start.md#6-module-view)
- [Widget preload provider](./00-quick-start.md#10-widget-preload-provider)
- [Frame](./00-quick-start.md#11-frame)
- [Проверочный чеклист](./00-quick-start.md#проверочный-чеклист)

### Навигация По Задачам

- [Добавить новый экран](./09-recipes.md#добавить-новый-экран)
- [Структура module package](./13-module-package-structure.md)
- [Добавить loader data](./09-recipes.md#добавить-loader-data)
- [Добавить action](./09-recipes.md#добавить-action)
- [Обновить данные после mutation](./09-recipes.md#обновить-данные-после-mutation)
- [Добавить query params](./09-recipes.md#добавить-query-params)
- [Добавить widget в экран](./09-recipes.md#добавить-widget-в-экран)
- [Preload widget](./09-recipes.md#preload-widget)
- [Структура widget package](./12-widget-package-structure.md)
- [Добавить frame](./09-recipes.md#добавить-frame)
- [Структура frame package](./15-frame-package-structure.md)
- [Выбрать provider phase](./09-recipes.md#выбрать-provider-phase)
- [Выбрать между module, widget и frame](./09-recipes.md#выбрать-между-module-widget-и-frame)
- [Добавить access guard](./11-guards.md)
- [Объявить реактивную сущность](./18-reactive-entities.md)

### Базовая Модель

- [Ментальная модель](./01-mental-model.md)
- [Карта runtime](./01-mental-model.md#карта-runtime)
- [Владение scope и cleanup](./01-mental-model.md#кто-чем-владеет)
- [Declaration не равен runtime](./01-mental-model.md#declaration-не-равен-runtime)
- [View-слой и runtime-слой](./01-mental-model.md#view-слой)
- [Основные потоки данных](./01-mental-model.md#основные-потоки-данных)

### Application Runtime

- [Application](./02-application.md)
- [Структура application host](./16-application-host-structure.md)
- [Контракт application](./02-application.md#контракт)
- [Порядок запуска](./02-application.md#порядок-запуска)
- [UI-слоты](./02-application.md#ui-слоты)
- [Инициализаторы](./02-application.md#инициализаторы)
- [Store приложения](./02-application.md#store-приложения)
- [Runtime-состояние session](./02-application.md#runtime-состояние-session)

### Routing И Экранные Modules

- [Router и навигация](./03-router-and-navigation.md)
- [Аудит зависимости от React Router](./19-react-router-dependency-audit.md)
- [Route](./03-router-and-navigation.md#route)
- [Наследование route](./03-router-and-navigation.md#наследование-route)
- [Layouts](./03-router-and-navigation.md#layouts)
- [Структура layout package](./14-layout-package-structure.md)
- [Exception UI на route](./03-router-and-navigation.md#exception-ui-на-route)
- [Location во view](./03-router-and-navigation.md#location-во-view)
- [Навигация во view](./03-router-and-navigation.md#навигация-во-view)
- [Location в runtime-коде](./03-router-and-navigation.md#location-в-runtime-коде)
- [Навигация в runtime-коде](./03-router-and-navigation.md#навигация-в-runtime-коде)
- [Навигация не равна revalidate](./03-router-and-navigation.md#навигация-не-равна-revalidate)

### Module Runtime

- [Module, Controller и Provider](./04-modules-controllers-providers.md)
- [Структура module package](./13-module-package-structure.md)
- [Declaration модуля](./04-modules-controllers-providers.md#declaration-модуля)
- [Когда использовать module](./04-modules-controllers-providers.md#когда-использовать-module)
- [Metadata модуля](./04-modules-controllers-providers.md#metadata-модуля)
- [Контракт controller](./04-modules-controllers-providers.md#контракт-controller)
- [Когда использовать controller](./04-modules-controllers-providers.md#когда-использовать-controller)
- [Чтение loader data](./04-modules-controllers-providers.md#чтение-loader-data)
- [Отправка actions](./04-modules-controllers-providers.md#отправка-actions)
- [Контракт provider](./04-modules-controllers-providers.md#контракт-provider)
- [Когда использовать provider](./04-modules-controllers-providers.md#когда-использовать-provider)
- [Фазы provider](./04-modules-controllers-providers.md#фазы-provider)
- [Provider для widget preload](./04-modules-controllers-providers.md#provider-для-widget-preload)
- [Структура файлов и public API](./10-file-structure.md)
- [Application host package](./10-file-structure.md#application-host-package)
- [Структура application host](./16-application-host-structure.md)
- [Layout package](./10-file-structure.md#layout-package)
- [Структура layout package](./14-layout-package-structure.md)
- [Module package](./10-file-structure.md#module-package)
- [Структура module package](./13-module-package-structure.md)
- [Widget package](./10-file-structure.md#widget-package)
- [Структура widget package](./12-widget-package-structure.md)
- [Frame package](./10-file-structure.md#frame-package)
- [Структура frame package](./15-frame-package-structure.md)
- [Token naming](./10-file-structure.md#token-naming)
- [Binding rules](./10-file-structure.md#binding-rules)
- [Index file rules](./10-file-structure.md#index-file-rules)

### Виджеты И Фреймы

- [Widgets](./05-widgets.md)
- [Структура widget package](./12-widget-package-structure.md)
- [Когда использовать widget](./05-widgets.md#когда-использовать-widget)
- [Declaration виджета](./05-widgets.md#declaration-виджета)
- [Rendering через WidgetHost](./05-widgets.md#rendering-через-widgethost)
- [Идентичность runtime](./05-widgets.md#идентичность-runtime)
- [Widget controller](./05-widgets.md#widget-controller)
- [Hooks во widget view](./05-widgets.md#hooks-во-widget-view)
- [Revalidate из controller](./05-widgets.md#revalidate-из-controller)
- [Widget preload](./05-widgets.md#widget-preload)
- [Frames](./06-frames.md)
- [Структура frame package](./15-frame-package-structure.md)
- [Когда использовать frame](./06-frames.md#когда-использовать-frame)
- [Declaration фрейма](./06-frames.md#declaration-фрейма)
- [Подключение frame к route](./06-frames.md#подключение-frame-к-route)
- [HashFrameSource](./06-frames.md#hashframesource)
- [Shell](./06-frames.md#shell)
- [Frame controller](./06-frames.md#frame-controller)
- [Hooks во frame view](./06-frames.md#hooks-во-frame-view)
- [Revalidate frame](./06-frames.md#revalidate-frame)
- [Открытие frame из React](./06-frames.md#открытие-frame-из-react)
- [Открытие frame из controller или service](./06-frames.md#открытие-frame-из-controller-или-service)
- [Providers фрейма](./06-frames.md#providers-фрейма)

### Инфраструктура

- [DI, runtime-состояние и события](./07-di-runtime-state-events.md)
- [DI facade](./07-di-runtime-state-events.md#di-facade)
- [Binding module](./07-di-runtime-state-events.md#binding-module)
- [UseBindings](./07-di-runtime-state-events.md#usebindings)
- [Runtime scopes](./07-di-runtime-state-events.md#runtime-scopes)
- [Store приложения](./07-di-runtime-state-events.md#store-приложения)
- [Event bus приложения](./07-di-runtime-state-events.md#event-bus-приложения)

### Policies, Revalidate И Ошибки

- [Policies, revalidate и ошибки](./08-policies-revalidate-errors.md)
- [Policies](./08-policies-revalidate-errors.md#policies)
- [Boundary decisions](./08-policies-revalidate-errors.md#boundary-decisions)
- [Runtime operation flow](./08-policies-revalidate-errors.md#runtime-operation-flow)
- [Runtime errors](./08-policies-revalidate-errors.md#runtime-errors)
- [Unauthorized recovery](./08-policies-revalidate-errors.md#unauthorized-recovery)
- [Revalidate runtime entity](./08-policies-revalidate-errors.md#revalidate-runtime-entity)
- [Revalidate widget](./08-policies-revalidate-errors.md#revalidate-widget)
- [Revalidate frame](./08-policies-revalidate-errors.md#revalidate-frame)
- [Runtime reporting](./08-policies-revalidate-errors.md#runtime-reporting)
- [Exception UI](./08-policies-revalidate-errors.md#exception-ui)
- [Guards](./11-guards.md)
- [Combining guards](./11-guards.md#combining)
- [Controller decorator](./11-guards.md#controller-decorator)
- [Hook](./11-guards.md#hook)
- [Guarded](./11-guards.md#guarded)

## Главная Граница API

Application code импортирует framework API через фасад:

```ts
import { Application, BindingModuleInterface, Inject, Injectable, Module, Route, Router, UseBindings } from '@tiyn/app';
```

Не импортируй Inversify, React Router internals или файлы
internal source files из feature/application packages. Публичная граница -
только `@tiyn/app`.

## Что Уже Реализовано

Документируются:

- lifecycle `Application`: `compose`, `initialize`, `createView`, `dispose`;
- application initializers;
- `ApplicationStoreInterface`;
- `SessionRuntimeStateInterface`;
- `ApplicationEventBusInterface` и `ApplicationEventScope`;
- DI facade: `Injectable`, `Inject`, `UseBindings`, binding modules;
- object-based `Router` и `Route`;
- route policies: `canMatch`, `canActivate`, `canAction`;
- route layouts;
- module runtime;
- controller `loader` / `action`;
- runtime providers: однократный `setup`, а также `beforeLoad`,
  `beforeRender`, `afterRender`, `onDemand`;
- singleton providers: `@SingletonProvider()`, один shared `setup` и
  reference-counted cleanup без runtime context;
- `LocationServiceInterface`, `NavigateServiceInterface`, `useLocation`, `useNavigate`,
  `NavItem`, `useRoutePending`, route matching через `location.matches(...)`;
- runtime-local revalidate через `useRevalidate` и
  `RevalidateServiceInterface`;
- source-aware runtime failures с локальными lifecycle boundaries и output-only
  reporting;
- widget runtime, `WidgetHost`, unified controller hooks и preload;
- frame declaration, `HashFrameSource`, shell, providers, frame controllers,
  unified controller hooks, frame-local actions, `useFrame`,
  `FrameServiceInterface`;
- access guards: `GuardInterface`, `Guard`, `@UseGuards`, `useGuard`,
  `Guarded`;
- typed runtime reporter pipeline;
- реактивные сущности через `@Entity`, автоматическую weak-registration,
  `updateEntity` и React bridge `reactive`.

## Что Не Считать Готовым API

Не описываются как готовые контракты:

- command bus;
- federation event bridge;
- общий параллельный readiness barrier для всех runtime-единиц;

## Нейтральные Примеры

В примерах используются условные сущности:

- `OrdersModule`;
- `OrdersController`;
- `OrdersSummaryWidget`;
- `OrderDetailsFrame`.

Это не доменная рекомендация. Имена нужны только для демонстрации формы API.
