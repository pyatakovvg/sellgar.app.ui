# Структура Application Host

Этот документ фиксирует целевую структуру для application host package:
`clients/{host-name}`.

Host package - это composition root приложения. Он связывает `@tiyn/app`,
feature packages, shared libraries, runtime config и deployment boundary.

Документ описывает структуру package, а не runtime-контракты framework.
Runtime application API описан в [Приложение](./02-application.md).

## Инварианты

- `clients/{host-name}` владеет только запуском приложения и composition
  root.
- Feature business logic живет в `modules/*`, `widgets/*`, `frames/*`,
  `layouts/*` и `library/domain`, а не в host package.
- Host package не должен становиться shared library.
- External feature packages не импортируют файлы из host package.
- Route tree, application-level components, application initializers,
  application policies и root DI bindings должны лежать в предсказуемых местах.
- Deployment/runtime boundary (`public/config.js`, nginx, Vite, PWA) остается на
  уровне host package.
- `build/` и `dev-dist/` являются generated output и не считаются source
  structure.

## Единая Структура

```text
clients/{host-name}/
  AGENTS.md
  index.html
  package.json
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  public/
    config.js
    favicon.png
  nginx/
    nginx.conf
    conf.d/
      default.conf
  src/
    main.ts
    bootstrap.tsx
    vite-env.d.ts
    styles/
      bootstrap.css
    application/
      index.ts
      {host-name}.application.tsx
      bindings/
        index.ts
        {host-name}.bindings.ts
      components/
        splash/
          index.ts
          splash.view.tsx
          default.module.scss
        fallback/
          index.ts
          fallback.view.tsx
          default.module.scss
        exception/
          index.ts
          exception.view.tsx
          default/
            index.ts
            default.tsx
            default.module.scss
          validation/
            index.ts
            validation.tsx
            default.module.scss
        not-found/
          index.ts
          not-found.view.tsx
      initializers/
        index.ts
        {name}.initializer.ts
      policies/
        index.ts
        {name}.policy.ts
      presentations/
        index.ts
        {name}.presentation.tsx
    sw/
      index.ts
      service-worker.tsx
      default.module.scss
```

Это одна структура с optional-каталогами. Каталоги не создаются заранее, если в
них нет файлов.

## Публичная Граница

Host package не является обычным reusable package.

Его source public boundary:

```ts
export { HostApplication } from './{host-name}.application.tsx';
```

Этот export нужен `src/bootstrap.tsx`. Другие workspace packages не должны
импортировать host package или deep paths из host package.

## `src/main.ts`

`src/main.ts` - browser entry для side-effect imports.

Здесь допустимы:

- `reflect-metadata`;
- global CSS/fonts/theme imports;
- `styles/bootstrap.css`;
- import `./bootstrap.tsx`.

В этом файле не должно быть:

- создание application instance;
- route configuration;
- DI binding;
- feature imports;
- domain calls.

## `src/bootstrap.tsx`

`src/bootstrap.tsx` запускает React и application lifecycle.

Допустимо:

- создать application instance;
- вызвать `compose()`;
- получить `AppView` через `createView()`;
- создать React root;
- подключить application-level React wrappers и service worker UI;
- запустить `initialize()`.

Недопустимо:

- объявлять routes;
- bind-ить services;
- читать или менять feature state;
- выполнять auth/domain business flow;
- импортировать modules/widgets/frames напрямую, если это не application-level
  provider wrapper.

## `application/{host-name}.application.tsx`

`{host-name}.application.tsx` содержит только application declaration:

- `@UseBindings(...)`;
- `app.components(...)`;
- `app.layouts(...)`;
- `app.initializers(...)`;
- `app.router(...)`.

В этом файле не должно быть:

- controller implementations;
- gateway/service implementations;
- direct HTTP calls;
- React hooks;
- local stores;
- auth side effects;
- feature UI implementation.

Route tree здесь является composition root. Он может импортировать package root
tokens:

- route modules из `@module/*`;
- frames из `@frame/*`;
- layouts из `@layout/*`;
- application-level preload providers из `@widget/*`;
- application policies из `./policies`.

Route tree не должен импортировать private files feature packages.

## `application/bindings`

`application/bindings` содержит root DI wiring.

Допустимо bind-ить:

- application initializers;
- application policies;
- application-level UI services;
- domain gateways/services;
- runtime config;
- application-level runtime error handlers;
- application-level widget/frame providers, если они подключаются в route tree.

Недопустимо:

- bind-ить module-local controllers;
- bind-ить widget/frame-local stores;
- создавать feature-specific helpers для одного экрана;
- размещать business logic внутри binding module.

Feature package сам владеет своими `classes.bindings.ts`.

## `application/initializers`

Initializers запускаются на application startup и живут в application lifecycle.

Допустимо:

- восстановить session/profile state;
- зарегистрировать runtime error handlers, например unauthorized recovery;
- положить application-level facts в `ApplicationStoreInterface`;
- подписаться на application-level external events через `context.disposables`;
- использовать `context.signal` для отмены async операций.

Недопустимо:

- напрямую выполнять route navigation;
- открывать frames;
- запускать module/widget/frame revalidate;
- держать feature-local process state;
- подменять route policies.

Navigation после изменения session state должна быть следствием route policies,
а не ручным redirect внутри initializer.

Если initializer показывает host-level dialog, подключай его через
`UserRequestServiceInterface` и presentation из application composition. UI
компоненты берутся из локального design kit; runtime logic не переносится в
view component.

## `application/policies`

Policies в host package - это application-specific route access decisions.

Допустимо:

- проверять application session state;
- возвращать `pass` или `fail` для route policy handlers;
- использовать policy только в route tree client composition.

Недопустимо:

- делать HTTP/domain calls;
- показывать dialogs;
- менять session state;
- выполнять navigation;
- содержать feature permissions, которые принадлежат конкретному module или
  controller guard.

Generic guard/framework logic не добавляется в client policies.

## `application/components`

`application/components` содержит application-level UI slots для
`app.components(...)` и route-level defaults.

Допустимо:

- splash;
- fallback;
- not found;
- application/route exception presentation;
- validation error presentation.

Недопустимо:

- feature screen UI;
- module/widget/frame content;
- business forms;
- domain operations.

Если UI относится к конкретному route screen, он должен жить в `modules/*`.
Если UI относится к overlay flow, он должен жить в `frames/*`.

## `sw`

`src/sw` содержит только registration/update UI для service worker.

Допустимо:

- `useRegisterSW(...)`;
- update prompt;
- portal в service-worker mount point;
- PWA update handling.

Недопустимо:

- feature notifications;
- auth/session recovery;
- route navigation;
- domain calls.

Service worker caching rules настраиваются в `vite.config.ts`, а не в
feature packages.

## `public`

`public/config.js` - runtime config boundary.

Этот файл:

- поставляется как static asset;
- может отличаться между окружениями;
- не является TypeScript source;
- должен сохранять финальный runtime config contract.

Если добавляется новая runtime env value, нужно проверить:

- `public/config.js`;
- ambient typing runtime config;
- потребителя domain/config;
- deployment config.

## `vite.config.ts` И `nginx`

`vite.config.ts` содержит build/PWA/dependency-splitting configuration client
package.

`nginx/*` содержит deployment serving configuration.

Эти файлы не должны знать о feature business logic. Изменения здесь считаются
изменениями deployment/build boundary и требуют отдельной проверки build.

## Naming

Application class:

```text
{HostName}Application
```

Application declaration file:

```text
application/{host-name}.application.tsx
```

Bindings:

```text
application/bindings/{host-name}.bindings.ts
```

Initializers:

```text
application/initializers/resolve-auth-state.initializer.ts
```

Policies:

```text
application/policies/require-authenticated-session.policy.ts
```

Application-level view slots:

```text
application/components/{slot}/{slot}.view.tsx
```

File names use kebab-case. Class names use PascalCase.

## Migration Checklist

For client-level changes:

- identify whether the behavior belongs to client composition root or to a
  feature package;
- keep routes in `{host-name}.application.tsx`;
- keep root DI wiring in `application/bindings`;
- keep startup/session/recovery code in `application/initializers`;
- keep route access decisions in `application/policies`;
- keep application UI slots in `application/components`;
- keep service worker update UI in `sw`;
- do not add feature business logic to host package;
- run `yarn build:management_panel_ui` when TypeScript, route composition,
  build config, PWA or deployment boundary changes.
