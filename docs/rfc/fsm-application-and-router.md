# RFC: FSM Application и Router

- Статус документа: draft
- Статус RFC: proposed
- Статус реализации: in-progress
- Последнее согласование: 2026-09-22

## Контекст

FSM-приложение использует server-driven модель: authoritative state находится на
backend, клиент отправляет команды, а backend публикует snapshots. В текущем
терминальном контракте поле `screen` определяет активный экран.

Новый `@sellgar/app/fsm` проектируется над общим core по образцу React-среза
`@sellgar/app/react`. Базовым consumer-примером является композиция приложения в
`sellgar.ui.admin/clients/admin/src/application` и его `bootstrap.tsx`.

Этот RFC фиксирует понятия FSM Application, Router и Snapshot Source. Source port
типизирован формой snapshot конкретного приложения. Bridge получает функцию
выбора адреса и не знает конкретное имя поля.

## FSM Application

FSM Application — React application facade для server-driven FSM. Он использует
общий application runtime и React rendering существующего framework.

Конкретное приложение наследуется от `Application`, экспортируемого
`@sellgar/app/fsm`, и в `configure` регистрирует components, layouts, features, initializers и
корневой Router.

Application не создаёт источник snapshots и не содержит transport-specific код.
В bootstrap ему передаётся RouterBridge. После этого используется существующий
lifecycle:

1. `compose()`;
2. `createView()`;
3. React render;
4. `initialize()`;
5. `dispose()` при завершении host.

Принципиальная форма композиции:

```ts
const app = new FsmApplication({
  routerBridge,
});

app.compose();

const AppView = app.createView();

root.render(<AppView />);

void app.initialize();
```

`FsmApplication` в примере обозначает конкретный application class. Framework не
содержит терминальную предметную специфику.

## FSM Router

FSM Router — router приложения, в котором адрес выбирается из snapshot переданной
при композиции функцией, а не из URL браузера. Текущее терминальное приложение
конфигурирует `routingKey: 'screen'`.

Router объявляется в application composition обычным деревом `Router` и `Route` и
передаётся через `app.router(...)`. Каждый Route описывает:

- address из сегментов FSM-адреса;
- class token экрана;
- lazy-loaded Module;
- вложенные Routes, layouts и providers, когда они нужны структуре приложения.

При получении snapshot Router:

1. получает адрес по строковому `routingKey`;
2. разбирает адрес как последовательность сегментов;
3. разрешает сегменты по объявленному route tree;
4. определяет активную ветку Route;
5. загружает Module конечного Route;
6. связывает активный snapshot с class token конечного Route;
7. передаёт результат существующему React rendering runtime.

Адрес не принадлежит route token. Каждый конечный FSM-адрес, который рендерит
самостоятельный экран, является самостоятельным Route, имеет собственный class token и
загружает собственный Module.

FSM Router не является browser router. Для смены FSM-экрана не используются browser URL,
History API, `push`, `replace`, back, forward, route authorization и redirect. Активный экран
определяется только очередным authoritative snapshot. Локальная команда ожидает
новый snapshot backend и не переключает Route самостоятельно.

## Snapshot Source

Framework знает только абстракцию
`FsmSnapshotSourceInterface<TSnapshot extends object>`. Она не фиксирует форму
snapshot и не требует поле `screen`. Единственная операция source — подписка на
snapshots; возвращаемый lease имеет асинхроный `dispose()`.

Отдельные `start()` и `stop()` не вводятся. В transport с demand-driven lifecycle
первая подписка открывает соединение, а освобождение последнего lease его
закрывает. RouterBridge владеет lease и освобождает его вместе с application
lifecycle.

Форма snapshot и её валидаторы принадлежат конкретному приложению. Transport
адаптер получает snapshot class в конструкторе, создаёт экземпляр и валидирует raw
payload до публикации RouterBridge.

`SignalRFsmSnapshotSource` — адаптер между этим port и demand-driven
`@library/signal-r`. Reconnect, transport errors и физический lifecycle соединения
остаются в transport-пакете; валидация payload и публикация snapshot — в адаптере.

## Связь Application и Router

Application владеет application composition и lifecycle. Router владеет route
tree и разрешением выбранного адреса в активную route branch.

```text
Application
  └── app.router(FsmRouter)
        └── snapshot[routingKey]
              └── Route
                    ├── class token
                    └── Module
```

Application не разбирает адрес. Router не создаёт React root и не управляет
application lifecycle.

На первом запуске `FsmRouterBridge.initialize()` остаётся незавершённым, пока
source не опубликует snapshot и router не завершит его восстановление. Поэтому
application сохраняет фазу `initializing` и показывает splash, пока не получен
один из терминальных результатов initial routing:

- активная Route-ветка и полностью подготовленный Module;
- `notFound` для отсутствующего в route tree адреса;
- ошибка source, разрешения Route или загрузки Module.

Одна лишь подписка на source не означает готовность RouterBridge. Если
восстановление snapshot было прервано и не закоммитило routing result, первый
запуск продолжает ожидать следующий snapshot. После завершения initial routing
последующие snapshots обрабатываются последовательно без возврата application в
initializing.

## Зафиксированные ограничения

- База FSM-среза — React-срез framework, а не Native-срез.
- FSM использует общий core и существующий application lifecycle.
- Отдельный второй runtime приложения не создаётся.
- Адрес, выбранный из snapshot, трактуется аналогично адресу browser router.
- Route tree остаётся декларативной частью application composition.
- Каждый конечный FSM screen имеет собственные Route, class token и Module.
- Backend snapshot является единственным источником смены активного экрана.
- Transport и форма snapshots не являются ответственностью Application или
  декларации Router.

## Вне текущего решения

Отдельного согласования требуют:

- порядок snapshots и revisions;
- декларация state и command metadata на class token.

До такого согласования эти сущности и API нельзя выводить из примеров или
фиксировать по аналогии с конкретным transport.

## Реализованная основа

В текущей итерации добавлены:

- публичный entrypoint `@sellgar/app/fsm`;
- FSM `Application` с существующим core lifecycle и React root host;
- FSM `Module`, `Layout`, `Router` и `Route`;
- универсальный subscription-only FSM snapshot source port и RouterBridge с настраиваемым
  выбором адреса;
- demand-driven `@library/signal-r` и адаптер `@library/fsm-signal-r`;
- application-owned `FsmSnapshot` с runtime-валидацией полей первого уровня;
- lazy Module resolution и route/module rendering;
- compile-time facade fixture и runtime-тесты базовой композиции;
- запускаемый `clients/fsm` с прямым bootstrap, SignalR source,
  `FsmApplication` и route tree;
- прикладные `modules/customer/splash` и `modules/customer/welcome`,
  переведённые на FSM-срез в существующих пакетах.

Технический initial Module удалён после подключения прикладных экранов.
Миграция выполняется в существующих пакетах без параллельных копий модулей.
`bootstrap.tsx` использует тот же прямой composition flow, что React-клиент; отдельная
bootstrap-фабрика и собственный lifecycle-контракт не вводятся.
