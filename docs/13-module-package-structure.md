# Структура Module-Пакета

Этот документ фиксирует целевую структуру каталогов для `modules/*`.
Он нужен для двух сценариев:

- создавать новые route modules без локальных вариантов структуры;
- мигрировать старые route modules в единую форму без изменения бизнес-логики.

Документ описывает структуру package, а не поведение runtime. Runtime-контракты
module, controller и provider описаны в
[Модули, Controllers И Providers](./04-modules-controllers-providers.md).

## Инварианты

- Один package в `modules/*` отвечает за один route-level screen.
- Package не должен раскрывать internal runtime-файлы через public API.
- Route загружает module только через package root.
- Все внешние потребители импортируют module только через package root.
- Каталоги не создаются заранее, если в них нет файлов.
- Если каталог импортируется из другого каталога, у него должен быть `index.ts`.
- `src/index.ts` является единственной public-границей package.
- Module declaration, view, DI bindings, controllers, providers, hooks,
  DTO и entities должны лежать в предсказуемых местах.

## Единая Структура

Базовая структура package:

```text
modules/{module-name}/
  AGENTS.md
  env.d.ts
  package.json
  tsconfig.json
  src/
    index.ts
    {module-name}.module.tsx
    classes/
      index.ts
      classes.bindings.ts
      controller/
        index.ts
        {feature}/
          index.ts
          {feature}-controller.interface.ts
          {feature}.controller.ts
          {feature}-loader.entity.ts
          dto/
            index.ts
            action.dto.ts
            filter.dto.ts
      service/
        index.ts
        {feature}/
          index.ts
          {feature}-service.interface.ts
          {feature}.service.ts
      store/
        index.ts
        {state}/
          index.ts
          {state}-store.interface.ts
          {state}.store.ts
      dto/
        index.ts
        filter.dto.ts
        search.dto.ts
        sort.dto.ts
        action.dto.ts
        loader.dto.ts
      entity/
        index.ts
        {entity}.entity.ts
    providers/
      index.ts
      {name}.provider.ts
    view/
      index.ts
      module.view.tsx
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
      module.constants.ts
```

Это одна структура с optional-каталогами. Обязательные файлы зависят от роли
module.

## Обязательный Минимум

Каждый route module должен иметь:

```text
src/
  index.ts
  {module-name}.module.tsx
  view/
    index.ts
    module.view.tsx
```

Если module использует controller, добавляются:

```text
src/
  classes/
    index.ts
    classes.bindings.ts
    controller/
      index.ts
      {feature}/
        index.ts
        {feature}-controller.interface.ts
        {feature}.controller.ts
```

Если module подключает runtime providers, добавляются:

```text
src/
  providers/
    index.ts
    {name}.provider.ts
```

## Публичный API

`src/index.ts` экспортирует только то, что нужно route loader или внешним
потребителям.

Module package обычно экспортирует:

```ts
export { OrdersModule } from './orders.module.tsx';
export type { OrdersLoaderData } from './classes/dto';
```

Запрещено экспортировать из package root без отдельной причины:

- concrete controller implementations;
- `classes.bindings.ts`;
- private view blocks;
- fallback/exception components;
- internal hooks;
- stores;
- services;
- helper functions.

Controller token экспортируется из package root только если внешний код должен
читать loader data, submit-ить action, запускать revalidate/action через runtime
API или писать тесты на module runtime contract. По умолчанию controller token
остается internal.

Provider экспортируется из package root только если другой package подключает
его в metadata `providers`.

## `{module-name}.module.tsx`

`src/{module-name}.module.tsx` содержит только route module declaration:

- `@UseBindings(...)`;
- `@Module(...)`;
- public module class;
- минимальный adapter metadata.

В этом файле не должно быть:

- JSX view implementation;
- business logic;
- controller implementations;
- local store;
- React hooks;
- HTTP/domain calls.

`view` в metadata должен указывать на `ModuleView`.
Предпочтительная форма:

```tsx
view: ModuleView;
```

React element форма допустима только если есть реальная причина адаптировать
view, и эта причина должна быть локально понятна.

## `classes`

`src/classes` хранит DI-bound runtime classes.

Разрешено:

- `classes.bindings.ts`;
- controllers;
- module-local services, если они действительно резолвятся через DI;
- stores;
- DTO;
- entities, если они принадлежат business/runtime слою module.

Запрещено:

- React components;
- styles;
- view-only helpers;
- domain gateway/service implementations;
- generic utilities без связи с module runtime.

`classes/classes.bindings.ts` должен связывать abstract tokens с concrete
implementations. Self-binding concrete class допустим только если concrete class
реально резолвится как token.

Любой `*-interface.ts` внутри `classes`, который используется как DI token,
должен экспортировать `abstract class`, а не TypeScript `interface`. Это
касается controllers, module-local services, stores и любых других DI-bound
classes.

## `classes/controller`

Для одного controller можно использовать плоскую форму:

```text
classes/controller/
  index.ts
  sign-in-controller.interface.ts
  sign-in.controller.ts
```

Для нескольких controllers используется вложение по feature:

```text
classes/controller/
  index.ts
  filter/
    index.ts
    filter-controller.interface.ts
    filter.controller.ts
  terminal/
    index.ts
    terminals-controller.interface.ts
    terminals.controller.ts
```

Controller files называются строго так:

```text
{feature}-controller.interface.ts
{feature}.controller.ts
```

Abstract token должен быть `*ControllerInterface`.
Файл `*controller.interface.ts` должен экспортировать `abstract class`.
Implementation должен быть без `Interface`.

`controller/index.ts` экспортирует controller tokens и implementations для
внутреннего binding слоя:

```ts
export { FilterControllerInterface, FilterController } from './filter';
export { TerminalsControllerInterface, TerminalsController } from './terminal';
```

Package root не реэкспортирует `controller/index.ts` по умолчанию.

## Controller DTO И Loader Entity

DTO, которые принадлежат конкретному controller action/loader, живут рядом с
controller:

```text
classes/controller/sign-in/
  dto/
    index.ts
    action.dto.ts
```

Loader entity, которая нужна только controller/view pair, может жить рядом с
controller:

```text
classes/controller/filter/
  filter-loader.entity.ts
```

Если DTO используется несколькими controllers, он переносится в
`classes/dto`.

Если DTO или entity должен стать public contract package, он остается в
`classes/dto` или `classes/entity` и экспортируется точечно через `src/index.ts`.

## `classes/dto`

`classes/dto` хранит module-local DTO для controller/runtime слоя.

Типовые файлы:

```text
filter.dto.ts
search.dto.ts
sort.dto.ts
action.dto.ts
loader.dto.ts
```

DTO из `classes/dto` не является public API package по умолчанию.

## `classes/entity`

`classes/entity` хранит business entities или view entities, которые принадлежат
module package.

Entity file называется строго так:

```text
{entity}.entity.ts
```

Если entity нужна только одному controller, она может лежать рядом с этим
controller. Если entity используется несколькими слоями package, она живет в
`classes/entity`.

## `classes/service`

`classes/service` используется только для module-local service, который:

- нужен нескольким controllers;
- имеет module-specific orchestration;
- резолвится через DI;
- не является domain service.

Service files называются строго так:

```text
{feature}-service.interface.ts
{feature}.service.ts
```

`{feature}-service.interface.ts` должен экспортировать `abstract class`, если
service резолвится через DI.

Если service просто прокидывает вызов в domain layer, он не нужен.
Controller должен использовать domain service напрямую.

## `classes/store`

`classes/store` используется только для состояния, которое принадлежит module
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
- хранить widget/frame state;
- напрямую показывать UI-сообщения;
- выполнять domain operation.

Если состояние нужно только одному React component, оно остается во view через
React state, а не выносится в `classes/store`.

## `providers`

`src/providers` хранит runtime providers module.

Provider file называется строго так:

```text
{name}.provider.ts
```

Provider не должен становиться service class. Если class выполняет business
operation, это controller или domain service, а не provider.

Provider экспортируется из package root только если другой package подключает
его в metadata `providers`.

## `view`

`src/view` содержит основной rendering route module.

Обязательные файлы:

```text
view/
  index.ts
  module.view.tsx
```

`module.view.tsx` является entry point view-слоя package.

View может:

- читать loader data через `useLoaderData`;
- вызывать submit/revalidate hooks;
- читать location через `useLocation`;
- выполнять navigation через `useNavigate`;
- открывать frames через `useFrame`;
- рендерить widgets через `WidgetHost`;
- собирать локальные presentation blocks.

View не должен:

- создавать DI scope;
- напрямую резолвить controller из container;
- выполнять DI binding;
- делать HTTP-запросы;
- содержать provider lifecycle logic.

Если внутри view появляется крупный визуальный блок, он выносится в
`view/{block}` с локальным `index.ts`. Этот блок остается частью конкретного
route screen и не становится reusable component.

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
- не владеет module runtime;
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
modules/terminals
```

Module class:

```text
TerminalsModule
```

Bindings:

```text
TerminalsBindings
```

Controller token:

```text
TerminalsControllerInterface
```

Controller implementation:

```text
TerminalsController
```

File names use kebab-case. Class names use PascalCase.

## Imports

- Внешние потребители импортируют только из package root.
- Внутренние импорты package используют локальные directory indexes, если они есть.
- Deep imports в `classes/controller/*`, `view/*`, `providers/*` из других
  packages запрещены.
- Импорты `@tiyn/app` остаются в declaration, controller, provider и view files,
  которые действительно используют runtime API.

## Migration Checklist

Для каждого module package:

- list current public exports from `src/index.ts`;
- перечислить route-потребителей и внешние deep imports;
- create missing directory indexes;
- move declaration to `src/{module-name}.module.tsx`;
- move main rendering to `src/view/module.view.tsx`;
- move DI bindings to `src/classes/classes.bindings.ts`;
- move controller tokens and implementations to `src/classes/controller`;
- verify every DI-facing `*-interface.ts` exports `abstract class`;
- choose flat controller layout for one controller or feature folders for
  multiple controllers;
- move controller-specific DTO to controller-local `dto`;
- move shared runtime DTO to `src/classes/dto`;
- move module-local services to `src/classes/service`;
- move runtime stores to `src/classes/store`;
- move runtime providers to `src/providers`;
- move fallback and exception UI to `src/components`;
- move shared DTO contracts to `src/classes/dto`;
- move business entities to `src/classes/entity`;
- reduce `src/index.ts` to public API only;
- перевести потребителей на imports из package root;
- run package build or full application build.

Migration must preserve behavior first. Renaming and moving files should not be
combined with business changes.

## Текущие Packages

### `modules/terminals`

Ближе всего к целевой структуре multi-controller list module.
Основные шаги миграции:

- добавить local indexes для `classes`, `classes/controller`, controller feature
  folders и `classes/dto`;
- оставить `filter` и `terminal-list` в `view`, потому что это части экрана;
- проверить, нужно ли `filter-loader.entity.ts` оставить рядом с controller или
  перенести в `classes/entity`, если он используется несколькими слоями package.

### `modules/terminal-registrations`

Та же форма, что `terminals`.
Основные шаги миграции:

- добавить local indexes для `classes` и `classes/dto`;
- добавить controller files, если module runtime уже ожидает controller tokens;
- оставить `filter` и `registration-list` в `view`.

### `modules/employees`

Та же форма, что `terminals`, с дополнительным view block `header`.
Основные шаги миграции:

- добавить local indexes для `classes`, `classes/dto` и view blocks;
- оставить `header`, `filter`, `employee-list` в `view`;
- не выносить header в `components`, пока он используется только этим screen.

### `modules/sign-in`

Модуль с одним action и runtime store.
Основные шаги миграции:

- добавить local indexes для `classes`, `classes/controller` и `classes/store`;
- решить, должен ли `classes/controller/dto/action.dto.ts` остаться
  controller-local или перейти в `classes/dto`, если payload используется
  несколькими слоями package;
- сохранить sign-in form blocks в `view/content`.

### `modules/password-set`

Модуль с одним action и локальными `content`/`errors` view.
Основные шаги миграции:

- добавить local indexes для `classes`, `classes/controller` и `classes/service`,
  если service действительно остается module-local orchestration;
- оставить `content` и `errors` в `view`, если они используются только этим
  screen.

### `modules/employee-invitation-accept`

Та же форма, что `password-set`.
Основные шаги миграции:

- добавить local indexes для `classes`, `classes/controller` и `classes/service`;
- проверить, что service не дублирует domain service pass-through;
- оставить `content` и `errors` в `view`.

## Review Checklist

- `src/index.ts` не раскрывает internal files.
- Нет external deep imports в `src/classes`, `src/view`, `src/providers`.
- Module declaration лежит в `src/{module-name}.module.tsx`.
- Main view всегда лежит в `src/view/module.view.tsx`.
- DI bindings лежат в `src/classes/classes.bindings.ts`.
- Controller pair лежит в `src/classes/controller`.
- Shared runtime DTO лежат в `src/classes/dto`.
- Shared DTO contracts лежат в `src/classes/dto`.
- Business entities лежат в `src/classes/entity`.
- Runtime providers лежат в `src/providers`.
- Fallback/exception UI лежит в `src/components`, если используется несколькими
  view blocks.
- Empty optional directories отсутствуют.
