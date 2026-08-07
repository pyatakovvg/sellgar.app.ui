# Граница Публичного API `@tiyn/app`

Документ определяет, что feature-код может считать публичным контрактом
`@tiyn/app`.

## Источники Истины

- `library/tiyn-app/src/index.ts` — список публичных экспортов.
- Декларации и типы в `library/tiyn-app/src/*` — семантика контракта.
- Тесты рядом с runtime-срезами — проверяемое поведение.

Папка `library/tiyn-app/types` является generated/build artifact и не задаёт
контракт.

## Публичные Категории

- application lifecycle и host composition;
- DI facade и binding contracts;
- router, route declarations и navigation services;
- module/controller declarations, loader/action hooks и revalidate;
- widget и frame declarations, hosts, services и lifecycle;
- runtime providers, scopes, cleanup и operation state;
- policies, guards и runtime errors;
- reactive entities и React bridge;
- встроенные notification и user-request features.

Конкретный символ является публичным только при одновременном выполнении двух
условий:

1. он экспортируется из `src/index.ts`;
2. его назначение описано в документации пакета или ближайшем `AGENTS.md`.

## Правило Импорта

Feature-код импортирует framework API из корня пакета:

```ts
import { Application, Module, Route, Router } from '@tiyn/app';
```

Deep imports из `@tiyn/app/src/*`, runtime implementation folders и generated
`types` запрещены.

## Внутренние Детали

Не являются feature-контрактом:

- внутренности React Router adapter;
- route object builders и module export resolvers;
- runners, pipelines и scope implementations;
- внутренние render layers;
- generated declarations под `types`;
- concrete implementation, когда публичный API предоставляет declaration,
  hook, service token или interface token.

Экспорт implementation-класса из `src/index.ts` сам по себе не является
основанием использовать его вместо высокоуровневого контракта.

## Runtime-Инварианты

- Scope владеет созданными runtime-объектами и их cleanup.
- Widget/frame preload готовит runtime для owner scope и `runtimeKey`.
- Revalidate резолвит реализацию из ближайшего активного runtime scope.
- Guard проверяет локальную capability; route boundary принадлежит policy.
- Reactive entity registry не является коллекцией данных или backend cache.

## Изменение Контракта

Изменение публичного контракта требует согласованного обновления:

- `src/index.ts`;
- соответствующей декларации или interface token;
- поведенческих тестов;
- профильного документа в `library/tiyn-app/docs`;
- ближайшего `AGENTS.md`, если меняются границы владения.

До появления такого полного изменения новый символ или механизм считается
внутренним.
