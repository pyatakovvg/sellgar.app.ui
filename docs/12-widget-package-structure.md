# Структура Widget-Пакета

Этот документ фиксирует целевую структуру каталогов для `widgets/*`.
Он нужен для двух сценариев:

- создавать новые widget packages без локальных вариантов структуры;
- мигрировать старые widget packages в единую форму без изменения бизнес-логики.

Документ описывает структуру package, а не поведение runtime. Runtime-контракты
виджета описаны в [Widgets](./05-widgets.md).

## Инварианты

- Один package в `widgets/*` отвечает за один reusable UI block.
- Package не должен раскрывать internal runtime-файлы через public API.
- Все внешние потребители импортируют widget только через package root.
- Каталоги не создаются заранее, если в них нет файлов.
- Если каталог импортируется из другого каталога, у него должен быть `index.ts`.
- `src/index.ts` является единственной public-границей package.
- Runtime declaration, view, DI bindings, controllers, providers, hooks,
  DTO и entities должны лежать в предсказуемых местах.

## Единая Структура

Базовая структура package:

```text
widgets/{widget-name}/
  AGENTS.md
  env.d.ts
  package.json
  tsconfig.json
  src/
    index.ts
    {widget-name}.widget.tsx
    widget.provider.tsx
    classes/
      index.ts
      classes.bindings.ts
      controller/
        index.ts
        {feature}-controller.interface.ts
        {feature}.controller.ts
      dto/
        index.ts
        widget-props.dto.ts
        widget-loader.dto.ts
        action.dto.ts
      entity/
        index.ts
        {entity}.entity.ts
      store/
        index.ts
        {state}/
          index.ts
          {state}-store.interface.ts
          {state}.store.ts
    providers/
      index.ts
      {name}.provider.ts
    view/
      index.ts
      widget.view.tsx
      default.module.scss
      {block}/
        index.ts
        {block}.tsx
        default.module.scss
    components/
      fallback/
        index.ts
        fallback.tsx
        default.module.scss
      exception/
        index.ts
        exception.tsx
        default.module.scss
    hooks/
      index.ts
      {name}.hook.ts
    constants/
      index.ts
      widget.constants.ts
```

Это одна структура с optional-каталогами. Обязательные файлы зависят от роли
package.

## Роли Package

### Runtime Widget

Runtime widget рендерится через `WidgetHost` и объявляется через `@Widget`.

Обязательные файлы:

```text
src/
  index.ts
  {widget-name}.widget.tsx
  view/
    index.ts
    widget.view.tsx
```

Если есть controller, добавляются:

```text
src/
  classes/
    index.ts
    classes.bindings.ts
    controller/
      index.ts
      {feature}-controller.interface.ts
      {feature}.controller.ts
```

Если widget владеет runtime providers для своих внутренних процессов, например
preload вложенного widget-а, добавляются:

```text
src/
  providers/
    index.ts
    {name}.provider.ts
```

### Provider Widget

Provider widget не использует `@Widget`, если ему не нужен widget runtime,
loader/action lifecycle или isolated fallback. Такой package может владеть
React context, DOM side effect или shell-level provider.

Обязательные файлы:

```text
src/
  index.ts
  widget.provider.tsx
  view/
    index.ts
    widget.view.tsx
```

Provider widget не должен имитировать `@Widget`, если runtime ему не нужен.
Если provider widget владеет React context, рядом с provider можно добавить
`widget.context.ts`. Это частный файл provider-сценария, а не обязательная часть
структуры widget package.

## Публичный API

`src/index.ts` экспортирует только то, что нужно внешним потребителям.

Runtime widget обычно экспортирует:

```ts
export { OrdersSummaryWidget } from './orders-summary.widget.tsx';
export type { OrdersSummaryWidgetData, OrdersSummaryWidgetProps } from './classes/dto';
```

Provider widget обычно экспортирует:

```ts
export { WidgetProvider } from './widget.provider.tsx';
export { WidgetView } from './view';
```

Запрещено экспортировать из package root без отдельной причины:

- concrete controller implementations;
- `classes.bindings.ts`;
- private view blocks;
- fallback/exception components;
- internal hooks;
- stores;
- helper functions.

Controller token экспортируется из package root только если внешний код должен
читать loader data, submit-ить widget action или писать тесты на widget runtime
contract. По умолчанию controller token остается internal.

## `{widget-name}.widget.tsx`

`src/{widget-name}.widget.tsx` содержит только runtime declaration:

- `@UseBindings(...)`;
- `@Widget(...)`;
- public widget class;
- минимальный adapter metadata.

В этом файле не должно быть:

- JSX view implementation;
- business logic;
- controller implementations;
- local store;
- React hooks;
- HTTP/domain calls.

Props, loader data и action payload не выносятся в общий `types`.
Они живут в `classes/dto`, если используются больше чем в одном файле или
должны быть public.

## `classes`

`src/classes` хранит DI-bound runtime classes.

Разрешено:

- `classes.bindings.ts`;
- controllers;
- DTO;
- entities;
- stores;
- internal services, если они действительно резолвятся через DI.

Запрещено:

- React components;
- styles;
- view-only helpers;
- domain gateway/service implementations;
- generic utilities без связи с widget runtime.

`classes/classes.bindings.ts` должен связывать abstract tokens с concrete
implementations. Self-binding concrete class допустим только если concrete class
реально резолвится как token.

Любой `*-interface.ts` внутри `classes`, который используется как DI token,
должен экспортировать `abstract class`, а не TypeScript `interface`. Это
касается controllers, stores, internal services и любых других DI-bound classes.

## `classes/controller`

Controller files называются строго так:

```text
{feature}-controller.interface.ts
{feature}.controller.ts
```

Пример:

```text
tabs-count-controller.interface.ts
tabs-count.controller.ts
```

Abstract token должен быть `*ControllerInterface`.
Файл `*controller.interface.ts` должен экспортировать `abstract class`.
Implementation должен быть без `Interface`.

`controller/index.ts` экспортирует token и implementation для внутреннего
binding слоя:

```ts
export { TabsCountControllerInterface } from './tabs-count-controller.interface.ts';
export { TabsCountController } from './tabs-count.controller.ts';
```

Package root не реэкспортирует `controller/index.ts` по умолчанию.

## `classes/dto`

`classes/dto` хранит DTO-like contracts widget runtime:

- widget props;
- loader data;
- action payload;
- public result DTO.

Типовые файлы:

```text
widget-props.dto.ts
widget-loader.dto.ts
action.dto.ts
```

DTO из `classes/dto` не является public API package по умолчанию. Если внешний
код должен типизировать `WidgetHost props` или action payload, конкретный DTO
экспортируется точечно через `src/index.ts`.

## `classes/entity`

`classes/entity` хранит business entities или view entities, которые принадлежат
widget package.

Entity file называется строго так:

```text
{entity}.entity.ts
```

Если entity нужна только одному controller, она может лежать рядом с этим
controller. Если entity используется несколькими слоями package, она живет в
`classes/entity`.

## `classes/store`

`classes/store` используется только для состояния, которое принадлежит widget
runtime и нужно controller/view flow.

Store files называются строго так:

```text
{state}-store.interface.ts
{state}.store.ts
```

`{state}-store.interface.ts` должен экспортировать `abstract class`, если store
резолвится через DI.

Store не должен:

- быть глобальным application store;
- хранить route/module state;
- напрямую управлять navigation;
- напрямую показывать UI-сообщения.

Если состояние нужно только одному React component, оно остается во view через
React state, а не выносится в `classes/store`.

## `providers`

`src/providers` хранит runtime providers, которыми владеет сам widget.

Все widget providers помечаются `@Provider()` и реализуют общий
`RuntimeProviderInterface<TProps>`.
Отдельного widget-only provider contract нет.

Если widget предоставляет reusable preload provider, этот provider живет в
widget package рядом с widget token и может экспортироваться из package root.
Внешний module, frame или layout не владеет implementation provider; он владеет
только execution point и подключает provider в своем `providers: [...]`.

Provider file называется строго так:

```text
{name}.provider.ts
```

Provider не должен становиться service class. Если class выполняет business
operation, это controller или domain service, а не provider.

Provider экспортируется из package root только если это public runtime API
пакета, например preload provider для этого widget. Internal provider остается
внутри package и подключается в `@Widget.providers`.

## `view`

`src/view` содержит основной rendering widget.

Обязательные файлы:

```text
view/
  index.ts
  widget.view.tsx
```

`widget.view.tsx` является entry point view-слоя package.

View может:

- читать widget props через `useWidgetProps`;
- читать loader data через `useLoaderData`;
- вызывать submit/revalidate hooks;
- открывать frame через public runtime API;
- собирать локальные presentation blocks.

View не должен:

- создавать DI scope;
- напрямую резолвить controller из container;
- выполнять DI binding;
- делать HTTP-запросы;
- содержать provider lifecycle logic.

Если внутри view появляется крупный визуальный блок, он выносится в
`view/{block}` с локальным `index.ts`. Этот блок остается частью конкретного
view-сценария и не становится reusable component.

## `components`

`src/components` хранит локальные reusable presentation components package.

Типовые каталоги:

```text
components/
  fallback/
    index.ts
    fallback.tsx
  exception/
    index.ts
    exception.tsx
```

Компонент помещается в `components`, если он:

- используется несколькими view blocks внутри package;
- не владеет widget runtime;
- не знает про DI;
- не делает domain calls.

Если component используется только одним view block, он остается рядом с этим
block в `view/{block}` с локальным `index.ts`.

## `hooks`

`src/hooks` хранит React hooks, которые относятся к package.

Hook file называется строго так:

```text
{name}.hook.ts
```

Hooks экспортируются из package root только если это осознанный public API.
В остальных случаях они доступны только внутри package через `hooks/index.ts`.

Hook не должен скрывать domain operation, mutation или navigation side effect,
если это уже является обязанностью controller.

## `constants`

`src/constants` используется только для именованных constants, которые нужны
нескольким слоям package.

Если constant нужна одному файлу, она остается в этом файле.

## Naming

Package directory:

```text
widgets/terminal-monitoring-tabs
```

Runtime widget class:

```text
TerminalMonitoringTabsWidget
```

Widget-owned runtime provider:

```text
TerminalMonitoringTabsEventsProvider
```

Bindings:

```text
TerminalMonitoringTabsBindings
```

Controller token:

```text
TabsCountControllerInterface
```

Controller implementation:

```text
TabsCountController
```

File names use kebab-case. Class names use PascalCase.

## Imports

- Внешние потребители импортируют только из package root.
- Внутренние импорты package используют локальные directory indexes, если они есть.
- Deep imports в `classes/controller/*`, `view/*`, `providers/*` из других
  packages запрещены.
- Импорты `@sellgar/app` остаются в declaration, controller, provider и view files,
  которые действительно используют runtime API.

## Migration Checklist

Для каждого widget package:

- classify package as runtime widget or provider widget;
- list current public exports from `src/index.ts`;
- перечислить внешних потребителей и deep imports;
- create missing directory indexes;
- move declaration to `src/{widget-name}.widget.tsx` if package is runtime widget;
- move provider boundary to `src/widget.provider.tsx` if package is provider widget;
- move main rendering to `src/view/widget.view.tsx`;
- move DI bindings to `src/classes/classes.bindings.ts`;
- move controller tokens and implementations to `src/classes/controller`;
- verify every DI-facing `*-interface.ts` exports `abstract class`;
- move runtime stores to `src/classes/store`;
- move widget-owned runtime providers to `src/providers`;
- move fallback and exception UI to `src/components`;
- move shared props/data/payload contracts to `src/classes/dto`;
- move business entities to `src/classes/entity`;
- reduce `src/index.ts` to public API only;
- перевести потребителей на imports из package root;
- run package build or full application build.

Migration must preserve behavior first. Renaming and moving files should not be
combined with business changes.

## Текущие Packages

### `widgets/terminal-monitoring-tabs`

Целевая роль: runtime widget.

Ближе всего к целевой структуре. Основные шаги миграции:

- добавить local indexes для `classes` и `classes/controller`;
- preload provider для самого widget держать в `src/providers/preload` и
  экспортировать из package root, если его подключают layout/module/frame;
- вынести public data/contracts в `classes/dto` или `classes/entity`, если они
  появятся;
- оставить fallback в `components/fallback`.

### `widgets/logout`

Целевая роль: runtime widget.

Основные шаги миграции:

- добавить local indexes для `classes`, `classes/controller` и `classes/store`;
- перенести `LogoutWidgetProps` в `classes/dto/widget-props.dto.ts`, если props
  читаются вне `{widget-name}.widget.tsx`;
- оставить confirm flow в `view/confirm`, потому что это часть конкретного
  rendering сценария;
- оставить fallback в `components/fallback`.

### `widgets/theme`

Целевая роль: provider widget.

Основные шаги миграции:

- сохранить `widget.provider.tsx` как provider boundary;
- сохранить `widget.context.ts` рядом с provider, потому что этот package
  реально владеет React context;
- оставить `view/widget.view.tsx` как public shell view;
- держать theme hooks в `hooks`;
- не переводить package на `@Widget`, пока ему не нужен widget runtime lifecycle.

## Review Checklist

- Package role явно понятна из структуры и `AGENTS.md`.
- `src/index.ts` не раскрывает internal files.
- Нет external deep imports в `src/classes`, `src/view`, `src/providers`.
- Runtime widget имеет `src/{widget-name}.widget.tsx`.
- Provider widget имеет `src/widget.provider.tsx`.
- Main view всегда лежит в `src/view/widget.view.tsx`.
- DI bindings лежат в `src/classes/classes.bindings.ts`.
- Controller pair лежит в `src/classes/controller`.
- Widget-owned providers лежат в `src/providers` и помечаются `@Provider()`.
- Fallback/exception UI лежит в `src/components`.
- Shared DTO contracts лежат в `src/classes/dto`.
- Business entities лежат в `src/classes/entity`.
- Empty optional directories отсутствуют.
