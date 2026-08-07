# Структура Frame-Пакета

Этот документ фиксирует целевую структуру каталогов для `frames/*`.
Он нужен для двух сценариев:

- создавать новые frame packages без локальных вариантов структуры;
- мигрировать старые drawer/modal flows в единую frame-форму без изменения
  бизнес-логики.

Документ описывает структуру package, а не runtime behavior. Runtime-контракты
frame, source, shell и controller описаны в [Фреймы](./06-frames.md).

## Инварианты

- Один package в `frames/*` отвечает за один hash-driven overlay flow.
- Package не должен раскрывать internal runtime-файлы через public API.
- Route composition и feature code импортируют frame только через package root.
- Каталоги не создаются заранее, если в них нет файлов.
- Если каталог импортируется из другого каталога, у него должен быть `index.ts`.
- `src/index.ts` является единственной public-границей package.
- Frame declaration, shell, view, DI bindings, controllers, params, DTO и
  entities должны лежать в предсказуемых местах.

## Единая Структура

Базовая структура package:

```text
frames/{frame-name}/
  AGENTS.md
  env.d.ts
  package.json
  tsconfig.json
  src/
    index.ts
    {frame-name}.frame.tsx
    classes/
      classes.bindings.ts
      controller/
        index.ts
        {feature}/
          index.ts
          {feature}-controller.interface.ts
          {feature}.controller.ts
          dto/
            index.ts
            action.dto.ts
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
      params/
        index.ts
        frame.params.ts
      dto/
        index.ts
        action.dto.ts
      entity/
        index.ts
        {entity}.entity.ts
      events/
        index.ts
        {event}.event.ts
    shell/
      index.ts
      frame.shell.tsx
    layout/
      {layout-name}/
        index.ts
        {layout-name}.layout.tsx
        view/
          index.ts
          layout.view.tsx
          default.module.scss
          {block}/
            index.ts
            {block}.tsx
            default.module.scss
    view/
      index.ts
      frame.view.tsx
      default.module.scss
      content/
        index.ts
        content.tsx
        default.module.scss
    components/
      fallback/
        index.ts
        fallback.tsx
        fallback.module.scss
      exception/
        index.ts
        exception.tsx
        default.module.scss
    constants/
      index.ts
      frame.constants.ts
```

Это одна структура с optional-каталогами. Обязательные файлы зависят от роли
frame.

## Обязательный Минимум

Каждый frame package должен иметь:

```text
src/
  index.ts
  {frame-name}.frame.tsx
  shell/
    index.ts
    frame.shell.tsx
  view/
    index.ts
    frame.view.tsx
  constants/
    index.ts
    frame.constants.ts
```

Если frame использует controller, добавляются:

```text
src/
  classes/
    classes.bindings.ts
    controller/
      index.ts
      {feature}/
        index.ts
        {feature}-controller.interface.ts
        {feature}.controller.ts
```

Если frame имеет hash params, добавляются:

```text
src/
  classes/
    params/
      index.ts
      frame.params.ts
```

Если frame имеет local fallback или exception presentation, добавляются:

```text
src/
  components/
    fallback/
      index.ts
      fallback.tsx
    exception/
      index.ts
      exception.tsx
```

## Публичный API

`src/index.ts` экспортирует только то, что нужно внешним потребителям.

Frame package обычно экспортирует:

```ts
export { OrderDetailsFrame } from './order-details.frame.tsx';
```

Если внешний code должен реагировать на события frame:

```ts
export { OrderUpdatedEvent } from './classes/events/order-updated.event.ts';
```

Запрещено экспортировать из package root без отдельной причины:

- concrete controller implementations;
- `classes.bindings.ts`;
- private view blocks;
- shell;
- fallback/exception components;
- internal stores и services;
- hash constants;
- params, если они нужны только самому frame package.

Controller token экспортируется из package root только если внешний код должен
читать loader data, submit-ить frame action, запускать revalidate/action через
runtime API или писать tests на frame runtime contract. По умолчанию controller
token остается internal.

## `{frame-name}.frame.tsx`

`src/{frame-name}.frame.tsx` содержит только runtime declaration:

- `@UseBindings(...)`;
- `@Frame(...)`;
- public frame class;
- минимальный adapter metadata.

В этом файле не должно быть:

- JSX view implementation;
- business logic;
- controller implementations;
- local store;
- React hooks;
- HTTP/domain calls.

`view` в metadata должен указывать на `FrameView`.
Если frame использует internal layouts, они объявляются в `layouts` metadata.
Предпочтительная форма:

```tsx
@Frame({
  layouts: [OrderDetailsLayout],
  view: FrameView,
})
```

React element форма допустима только если есть реальная причина адаптировать
view, и эта причина должна быть локально понятна.

## `shell`

`src/shell` содержит visual container frame: drawer, modal, dialog, panel или
другой overlay shell.

Shell:

- реализует `FrameShellInterface`;
- получает управление через `FrameShellContextInterface`;
- не загружает данные;
- не выполняет business actions;
- не знает про hash parsing.

Shell class может сохранять package-specific имя:

```ts
export class OrderDetailsFrameShell extends FrameShellInterface {}
```

Файл при этом называется стабильно:

```text
shell/frame.shell.tsx
```

## `layout`

`src/layout` хранит frame-local layouts. Это те же `@Layout(...)`, что
используются route runtime, но package ownership остается внутри frame.

Layout нужен, когда frame content имеет стабильный internal shell: header,
toolbar, action controls, footer, tabs или общую композицию вокруг нескольких
content blocks.

Пример:

```text
layout/
  main/
    index.ts
    main.layout.tsx
    view/
      index.ts
      layout.view.tsx
      header/
        index.ts
        header.tsx
      controls/
        index.ts
        controls.tsx
```

`main.layout.tsx` содержит только declaration:

```tsx
@Layout({
  view: LayoutView,
})
export class MainLayout {}
```

Frame-local layout не экспортируется из package root. Он подключается только в
`@Frame({ layouts: [...] })` внутри того же package.

Layout может читать frame runtime через frame hooks, если это нужно для shell
composition: header title, footer controls, submit state. Но layout не владеет
loader/action data structures и не должен создавать отдельный data contract.
Данные по-прежнему принадлежат frame controller.

## `classes`

`src/classes` хранит DI-bound runtime classes.

Разрешено:

- `classes.bindings.ts`;
- controllers;
- frame-local services, если они действительно резолвятся через DI;
- stores;
- params;
- DTO;
- entities;
- events.

Запрещено:

- React components;
- styles;
- view-only helpers;
- domain gateway/service implementations;
- generic utilities без связи с frame runtime.

`classes/classes.bindings.ts` должен связывать abstract tokens с concrete
implementations. Self-binding concrete class допустим только если concrete class
реально резолвится как token.

Любой `*-interface.ts` внутри `classes`, который используется как DI token,
должен экспортировать `abstract class`, а не TypeScript `interface`. Это
касается controllers, frame-local services, stores и любых других DI-bound
classes.

## `classes/params`

Hash params frame живут в `classes/params`, потому что они являются runtime DTO
source-слоя frame.

Пример:

```ts
export class OrderDetailsFrameParams {
  @Expose()
  readonly id!: string;
}
```

Package root не экспортирует params по умолчанию. Если внешний код должен
типизировать `frame.open(...)`, export добавляется явно и осознанно.

## Структуры Данных

Frame data structures лежат рядом с владельцем contract.

Если DTO описывает loader result или action payload конкретного controller,
его место:

```text
classes/controller/{feature}/dto/
```

Если DTO/entity разделяется несколькими controllers, services или stores внутри
frame package, он может быть вынесен в:

```text
classes/dto/
classes/entity/
```

Правило выбора:

- controller-owned request/response shape остается рядом с controller;
- frame-level DTO/entity используется только когда contract действительно
  общий для нескольких runtime classes;
- view, layout, shell и components не объявляют DTO/entity;
- layout/view читают typed loader data через frame hooks, но не становятся
  владельцами data structures;
- domain DTO/entity не копируются в frame без причины; frame DTO адаптирует
  только форму, нужную UI/runtime contract.

## `view`

`src/view` содержит основной rendering frame content.

Обязательные файлы:

```text
view/
  index.ts
  frame.view.tsx
```

`frame.view.tsx` является entry point view-слоя package и экспортирует
`FrameView`.

View может:

- читать frame loader data;
- submit-ить frame actions;
- читать frame props через runtime hooks;
- собирать локальные presentation blocks.

View не должен:

- объявлять `@Frame`;
- создавать DI scope;
- выполнять DI binding;
- напрямую управлять hash source;
- содержать shell/container behavior.

Если внутри view появляется крупный визуальный блок, он выносится в
`view/{block}` с локальным `index.ts`. Этот блок остается частью конкретного
frame content и не становится reusable component.

## `components`

`src/components` хранит локальные runtime slots и reusable presentation
components package.

`fallback` и `exception` живут в `components`, потому что они передаются в
metadata frame как runtime slots, а не являются частью основного `FrameView`.

Компонент помещается в `components`, если он:

- используется несколькими view blocks внутри package;
- не владеет frame declaration;
- не знает про DI binding;
- не делает domain calls.

Если component используется только одним view block, он остается рядом с этим
block в `view/{block}` с локальным `index.ts`.

## `constants`

`src/constants/frame.constants.ts` хранит package-local constants frame, включая
hash key.

Hash key не экспортируется из package root по умолчанию. Потребители должны
открывать frame через `useFrame(...)` или `FrameServiceInterface`, а не руками
собирать hash.

## Naming

Package directory:

```text
frames/terminal-registration-review
```

Frame token:

```text
TerminalRegistrationReviewFrame
```

Declaration file:

```text
terminal-registration-review.frame.tsx
```

View entry:

```text
view/frame.view.tsx
```

Shell entry:

```text
shell/frame.shell.tsx
```

Bindings:

```text
classes/classes.bindings.ts
```

File names use kebab-case. Class names use PascalCase.

## Imports

- Внешние потребители импортируют только из package root.
- Внутренние импорты package используют локальные directory indexes, если они есть.
- Deep imports в `view/*`, `components/*`, `shell/*`, `constants/*` из других
  packages запрещены.
- Импорты `@tiyn/app` остаются в declaration, shell и runtime files, которые
  действительно используют frame API.

## Migration Checklist

Для каждого frame package:

- list current public exports from `src/index.ts`;
- перечислить route/application потребителей и внешние deep imports;
- move declaration to `src/{frame-name}.frame.tsx`;
- move shell to `src/shell/frame.shell.tsx`;
- move frame-local composition wrappers to `src/layout/{layout-name}`;
- move bindings to `src/classes/classes.bindings.ts`;
- verify every DI-facing `*-interface.ts` exports `abstract class`;
- move hash constants to `src/constants/frame.constants.ts`;
- move hash params to `src/classes/params/frame.params.ts`;
- move controller-owned DTO/action payloads to
  `src/classes/controller/{feature}/dto`;
- move main rendering entry to `src/view/frame.view.tsx`;
- move runtime fallback/exception slots to `src/components`;
- keep frame token, hash key, controller contracts and public events unchanged;
- update package `AGENTS.md`;
- run build/tests for the consuming application.
