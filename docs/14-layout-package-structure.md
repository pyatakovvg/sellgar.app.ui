# Структура Layout-Пакета

Этот документ фиксирует целевую структуру каталогов для `layouts/*`.
Он нужен для двух сценариев:

- создавать новые layout packages без локальных вариантов структуры;
- мигрировать старые layout packages в единую форму без изменения UI-логики.

Документ описывает структуру package, а не конкретный runtime owner. Runtime
contract layout описан в [Router И Навигация](./03-router-and-navigation.md#layouts)
и переиспользуется route, frame и другими runtime owners без отдельного layout
type.

## Инварианты

- Один package в `layouts/*` отвечает за один composition shell.
- Package не должен раскрывать internal view blocks через public API.
- Runtime composition импортирует layout только через package root.
- Каталоги не создаются заранее, если в них нет файлов.
- Если каталог импортируется из другого каталога, у него должен быть `index.ts`.
- `src/index.ts` является единственной public-границей package.
- Layout declaration и React rendering должны быть разделены.

## Единая Структура

Базовая структура package:

```text
layouts/{layout-name}/
  AGENTS.md
  env.d.ts
  package.json
  tsconfig.json
  src/
    index.ts
    {layout-name}.layout.tsx
    providers/
      index.ts
      {name}.provider.ts
    view/
      index.ts
      layout.view.tsx
      default.module.scss
      {block}/
        index.tsx
        {block}.tsx
        default.module.scss
        assets...
    components/
      {component}/
        index.tsx
        {component}.tsx
        default.module.scss
    hooks/
      index.ts
      {name}.hook.ts
    constants/
      index.ts
      layout.constants.ts
```

Это одна структура с optional-каталогами. Обязательные файлы:

```text
src/
  index.ts
  {layout-name}.layout.tsx
  view/
    index.ts
    layout.view.tsx
```

## Публичный API

`src/index.ts` экспортирует только layout token:

```ts
export { AuthLayout } from './auth.layout.tsx';
```

Запрещено экспортировать из package root без отдельной причины:

- `LayoutView`;
- private view blocks;
- local components;
- hooks;
- constants;
- assets.

## `{layout-name}.layout.tsx`

`src/{layout-name}.layout.tsx` содержит только framework declaration:

- `@Layout(...)`;
- public layout class;
- ссылку на `LayoutView`.
- layout-level providers, если runtime принадлежит самому layout.

Пример:

```tsx
import { Layout } from '@sellgar/app';

import { LayoutView } from './view';

@Layout({
  providers: [AuthShellPreloadProvider],
  view: LayoutView,
})
export class AuthLayout {}
```

В этом файле не должно быть:

- JSX view implementation;
- styles;
- local presentation blocks;
- React hooks;
- business logic;
- HTTP/domain calls.

## `view`

`src/view` содержит основной rendering layout.

Обязательные файлы:

```text
view/
  index.ts
  layout.view.tsx
```

`layout.view.tsx` является entry point view-слоя package.

View может:

- читать `props.children`;
- рендерить shell layout;
- подключать provider wrappers;
- рендерить widgets через `WidgetHost`;
- использовать router UI primitives вроде `NavLink`;
- собирать локальные presentation blocks.

View не должен:

- объявлять `@Layout`;
- создавать DI scope;
- выполнять DI binding;
- делать HTTP-запросы;
- содержать module/widget/frame lifecycle logic.

Если внутри view появляется крупный визуальный блок, он выносится в
`view/{block}` с локальным `index.ts`. Этот блок остается частью конкретного
layout shell и не становится reusable component.

Assets лежат рядом с блоком, который их использует.

## `components`

`src/components` хранит локальные reusable presentation components package.

Компонент помещается в `components`, если он:

- используется несколькими view blocks внутри package;
- не владеет layout declaration;
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
если это уже обязанность module/widget/frame runtime.

## `providers`

`src/providers` хранит runtime providers, implementation которых принадлежит
layout shell.

Если layout сам реализует shell-level runtime process, provider остается внутри
layout package и объявляется в `@Layout.providers`. Если provider является
reusable preload adapter конкретного widget, implementation provider живет в
widget package, а layout только импортирует public provider и объявляет его в
`@Layout.providers`.

Provider file называется строго так:

```text
{name}.provider.ts
```

Provider экспортируется из package root только если внешний package должен
подключать его явно. Для layout-owned provider это обычно не нужно: внешний route
должен импортировать только layout token.

## `classes`, `dto`, `entity`

Layout package по умолчанию не создает `classes`, `dto` и `entity`.

Layout - shell composition layer. Если ему нужны данные, action, loader,
independent revalidate или process state, сначала нужно проверить, не должен ли
этот behavior жить в module, widget, frame или application initializer.

Layout не должен знать, где он используется. Один и тот же layout contract
должен одинаково работать в route, frame или другом runtime owner.

Добавление business/runtime слоя в layout package требует отдельного
архитектурного решения. Layout-level provider допустим только для runtime,
которым владеет сам layout shell.

## Naming

Package directory:

```text
layouts/terminal-monitoring
```

Layout token:

```text
TerminalMonitoringLayout
```

Declaration file:

```text
auth.layout.tsx
```

View entry:

```text
view/layout.view.tsx
```

File names use kebab-case. Class names use PascalCase.

## Imports

- Внешние потребители импортируют только из package root.
- Внутренние импорты package используют локальные directory indexes, если они есть.
- Deep imports в `view/*`, `components/*`, `hooks/*` из других packages
  запрещены.
- Импорты `@sellgar/app` остаются в declaration и view files, которые действительно
  используют layout API.

## Migration Checklist

Для каждого layout package:

- list current public exports from `src/index.ts`;
- перечислить route/application потребителей и внешние deep imports;
- create `src/{layout-name}.layout.tsx`;
- move `@Layout(...)` and public layout class to `src/{layout-name}.layout.tsx`;
- create `src/view/index.ts`;
- move React rendering to `src/view/layout.view.tsx`;
- move root layout styles to `src/view/default.module.scss`;
- move local view blocks to `src/view/{block}`;
- move layout-owned runtime providers to `src/providers`;
- keep assets near the block that uses them;
- reduce `src/index.ts` to layout token export only;
- перевести потребителей на imports из package root;
- run package build or full application build.

Migration must preserve behavior first. Renaming and moving files should not be
combined with UI changes.

## Текущие Packages

### `layouts/auth`

Целевая роль: auth route shell.

Нормализованная структура:

- `src/auth.layout.tsx` - `AuthLayout` declaration;
- `src/view/layout.view.tsx` - grid, header slot, banner slot и `children`;
- `src/view/header` - logo header;
- `src/view/banner` - promo banner and local assets.

### `layouts/main`

Целевая роль: application shell.

Нормализованная структура:

- `src/main.layout.tsx` - `MainLayout` declaration;
- `src/view/layout.view.tsx` - providers, root wrapper, global message/dialog UI.

### `layouts/navigate`

Целевая роль: private navigation shell.

Нормализованная структура:

- `src/navigate.layout.tsx` - `NavigateLayout` declaration;
- `src/view/layout.view.tsx` - sidebar, navigation links, theme/logout widgets.

### `layouts/terminal-monitoring`

Целевая роль: terminal monitoring section shell.

Нормализованная структура:

- `src/terminal-monitoring.layout.tsx` - `TerminalMonitoringLayout` declaration;
- `src/view/layout.view.tsx` - section header, tabs widget and content outlet;
- `src/providers` - только layout-owned runtime providers;
- `src/view/header` - section presentation header.

## Review Checklist

- `src/index.ts` экспортирует только layout token.
- Нет external deep imports в `src/view`, `src/components`, `src/hooks`.
- Layout declaration лежит в `src/{layout-name}.layout.tsx`.
- Main view всегда лежит в `src/view/layout.view.tsx`.
- Root styles лежат в `src/view/default.module.scss`.
- View blocks лежат в `src/view/{block}`.
- Assets лежат рядом с consuming block.
- Layout-owned providers лежат в `src/providers`, помечаются `@Provider()` и
  объявляются в `@Layout.providers`.
- Widget preload providers импортируются из widget package, если implementation
  provider принадлежит widget.
- Layout не создает `classes`, `dto`, `entity` без отдельного архитектурного
  решения.
- Empty optional directories отсутствуют.
