# Next.js App Router

Статус: рабочий прототип. Публичный entrypoint — `@sellgar/app/next`.
Next.js владеет файловым деревом маршрутов и переходами. Адаптер подключает
существующие core DI, application/module lifecycle, controllers и providers.
Синхронизация маршрутов Next с route graph фреймворка не выполняется.

## Подключение приложения

Поддерживается Next.js `>=16.3.0 <17` с Turbopack. Проект устанавливает
`next`, React, React DOM и остальные необходимые peers фреймворка.

```ts
// next.config.ts
import type { NextConfig } from 'next';
import { withApp } from '@sellgar/app/next';

const nextConfig: NextConfig = {};

export default withApp(nextConfig, {
  application: './src/application/site.application.ts',
});
```

Путь `application` разрешается относительно каталога Next-проекта. Файл
экспортирует именованную фабрику `createApplication`. Если путь не задан,
адаптер использует пустое приложение.

```ts
import { Application, type ApplicationConfiguratorInterface } from '@sellgar/app/next';

class SiteApplication extends Application {
  protected configure(app: ApplicationConfiguratorInterface): void {
    app.features([]);
    app.initializers([]);
    app.metrics([]);
  }
}

export function createApplication(): SiteApplication {
  const app = new SiteApplication();
  app.reporter([]);
  return app;
}
```

Reporters регистрируются до `compose()`. Адаптер сам вызывает `compose()`
и `initialize()`. Конфигурация Next выбирает файл фабрики и настраивает сборку;
оценка `next.config` не создаёт runtime-приложение.

## Модули и layouts

Пакет модуля экспортирует один класс с `@Module()`. Пакет layout экспортирует
один класс с `@Layout()`. Контроллеры, stores и providers подключаются теми же
`@UseBindings()` и DI-контрактами, что и в React-адаптере.

```tsx
// app/page.tsx
import { withModule } from '@sellgar/app/next';

export default withModule(() => import('@module/home'));
```

```tsx
// app/section/layout.tsx
import { withLayout } from '@sellgar/app/next';

export default withLayout(() => import('@layout/section'));
```

Общий framework layout можно подключить непосредственно внутри `body`
корневого Next layout, сохранив HTML-документ на уровне клиента:

```tsx
import type { ReactNode } from 'react';
import { withLayout } from '@sellgar/app/next';

const MainLayout = withLayout(() => import('@layout/main'));

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <MainLayout>{children}</MainLayout>
      </body>
    </html>
  );
}
```

Плагин добавляет application context вокруг содержимого `body` при компиляции.
Дочерние layouts и модули наследуют DI scope родительского framework layout.
Next сохраняет layout при переходах внутри его ветки; при unmount дочерние
ресурсы освобождаются раньше родительских.

`withModule` и `withLayout` объявляются в Server Component файлах `page`
и `layout` соответственно. На один файл допускается одна framework-декларация
с литеральным `() => import('...')`. Дополнительные route groups не требуются.

## Выполнение и ограничения прототипа

- Серверное приложение принадлежит одному RSC-запросу и освобождается через
  `after()`. В браузере используется отдельное приложение с учётом StrictMode.
- Контейнеры, class tokens и экземпляры контроллеров не сериализуются. Через
  RSC-границу передаются данные loaders и описание доступных методов.
- Первый браузерный load воспроизводит серверные loader results через core
  pipeline. Произвольное состояние полей контроллеров и stores не переносится.
- Интерактивный код читает `useLoaderData`; доступ к живому контроллеру становится
  доступен после `useModuleReady()` или `useLayoutReady()`.
- Методы контроллера в браузере исполняются локально. RPC и Server Actions
  автоматически из методов контроллера не генерируются.
- Одна фабрика приложения используется на сервере и в браузере. Выбор участников
  по среде выполнения ещё не реализован; browser-only SDK требуют отдельной адаптации.
- Lifecycle features подключён. Их UI wrappers и presentation-слои ещё не
  подключены к Next-host полностью.
- Поддержка `template.tsx`, webpack и всех возможностей parallel/intercepting
  routes в прототипе не заявлена.

## Проверка

```sh
yarn workspace @sellgar/app typecheck:core
yarn workspace @sellgar/app typecheck:next
yarn workspace @sellgar/app test:next
```

Для `typecheck:next` нужен установленный `next`. Node regression-тесты проверяют
bootstrap, трансформации, SSR snapshots, hydration, DI, StrictMode и cleanup.
Интеграционную сборку и браузерные переходы дополнительно проверяет Next-проект.
