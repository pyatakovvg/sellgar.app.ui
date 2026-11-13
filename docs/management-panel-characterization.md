# Framework в композиции Management Panel

- Статус документа: current
- Область: использование публичного React entrypoint `@sellgar/app` панелью управления.

Панель использует общий core lifecycle через `Application` из `@sellgar/app/react`.
Application, routing, features и загружаемые Module уже подключены к этому
runtime. Действующие framework-контракты описаны в [README](../README.md);
[RFC универсального ядра](rfc/universal-core-renderers-router-bridge.md)
сохраняет целевую архитектуру и незавершённые части общего переноса.

## Владельцы композиции

Пути ниже относятся к `code/` приложения-хоста:

| Владелец    | Путь                                                                         | Ответственность                                                      |
| ----------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Bootstrap   | `clients/management-panel/src/bootstrap.tsx`                                 | Создание приложения, bridge и React root                             |
| Application | `clients/management-panel/src/application/management-panel.application.tsx`  | Components, layouts, features, initializers, metrics и routing shell |
| Router      | `clients/management-panel/src/application/routes/management-panel.router.ts` | `Router`, `Route`, typed tokens, policies и lazy module loads        |
| Bindings    | `clients/management-panel/src/application/bindings`                          | Связывание прикладных зависимостей с публичными framework ports      |

## Маршруты и доступ

Корневое дерево разделяет anonymous/authenticated ветки через session policies.
Authenticated branch содержит терминалы, операции, инциденты, пользователей и
уведомления. Проверка разделов относится к `AccessToSection`, а framework
выполняет её в route policy boundary.

Review/create/edit сценарии подключаются как вложенные `Router` в `Route.routing`.
Они загружают обычные `@Module` и используют `@Shell` для отображения фрейма.
Отдельных `FrameRoute`, `FrameRouter` и второго module lifecycle нет.

## Данные и процессы

Controllers получают dependencies через bindings и возвращают данные через
`loader`; `action`, `useSubmit`, `useRevalidate` и controller invocation используют
core processing/error state. Query принадлежит `RouteQueryServiceInterface`,
параметры Route — `LocationServiceInterface` и `ControllerArgs`.

Operations используют инжектируемый Collector. Он возвращает накопленный массив,
а формат API, фильтры, сортировка и cursor остаются у прикладного потребителя.
Сброс выборки сохраняет принятые данные до успешной загрузки замены.

Application features подключают session expiration, service worker, navigation
blocker, notifications и user requests. Providers связывают прикладные ресурсы
с lifecycle владельца. Domain gateways, access rules и SignalR не переносятся
в framework.

## Проверка совместимости

Framework regression tests покрывают routing, policies, loader transactions,
Collector, providers, history, error boundaries и cleanup. Consumer-проверка
панели включает TypeScript/build и browser-сценарии root/nested navigation,
query, Back/close, supersede, повторный вход в раздел и session expiration.

Эта карта описывает React-композицию панели. Native, FSM и Next имеют собственные
публичные фасады и дополнительные проверки; поведение устройств и конкретных
транспортов не следует из browser-проверки панели.
