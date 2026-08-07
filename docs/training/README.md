# Курс Для Преподавателя: `@tiyn/app`

- Статус документа: current
- Формат: презентация, live coding, вопросы аудитории и практические задания
- Источник истины: public API `src/index.ts`, runtime-код, тесты и документы из
  [руководства разработчика](../README.md)

## Назначение

Этот раздел превращает техническую документацию `@tiyn/app` в материал для
очного обучения. Это не альтернативный API reference. Слайды дают аудитории
ментальную модель и практический путь, а подробности контракта преподаватель
уточняет по основным документам пакета.

Курс построен по двум одновременно растущим линиям:

1. Одно учебное приложение развивается от `Hello World` до production-like
   сценария.
2. Каждая новая runtime-сущность проходит собственную лестницу: назначение,
   минимальная форма, взаимодействие, lifecycle, ограничения и сложный кейс.

Главное правило: пример не использует понятие, которое ещё не было введено.
Если поздняя версия примера требует нового механизма, сначала формулируется
проблема, затем вводится механизм, который её решает.

## Для Кого Курс

Базовое ожидание от слушателя:

- уверенное чтение TypeScript и React;
- понимание component, props, hook и Promise;
- базовое представление о URL, route и HTTP request;
- DI, decorators, runtime scopes и lifecycle знать заранее не обязательно.

Материал модульный. Для нового сотрудника используется весь маршрут. Опытному
React-разработчику можно сократить live coding первых занятий, но нельзя
пропускать ментальную модель runtime: именно она отличает `@tiyn/app` от набора
React-компонентов.

## Как Пользоваться Материалом

Каждое занятие состоит из одинаковых частей:

- **на экране** — короткая мысль или небольшой фрагмент кода;
- **заметки ведущего** — что объяснить голосом и на чём сделать акцент;
- **live coding** — одно наблюдаемое изменение учебного приложения;
- **контрольная точка** — вопрос, по которому видно, понята ли модель;
- **практика** — маленькая самостоятельная модификация;
- **мост к следующей теме** — ограничение текущего решения, создающее
  мотивацию для следующего занятия.

Слайд не должен становиться страницей документации. На нём оставляется одна
мысль, схема или фрагмент до 15–20 строк. Полный контракт и редкие варианты
остаются в ссылках для преподавателя.

## Сквозной Учебный Проект

В курсе используется нейтральное приложение `Orders Training`. Оно выбрано не
как доменная рекомендация, а потому что на заказах легко показать список,
фильтры, детали, действия и обновления.

Приложение развивается поступательно:

```text
Hello World
-> экран заказов
-> сервис и DI binding
-> второй route и навигация
-> loader со списком заказов
-> action изменения фильтра
-> общий layout
-> summary widget
-> details frame
-> lifecycle provider
-> application event
-> reactive entity update
-> revalidate
-> policy и guard
-> runtime error recovery
-> notification и user request
```

На ранних занятиях используются локальные данные. HTTP, авторизация и
интеграционные события появляются только после того, как слушатель понимает
владельца каждого runtime и место cleanup.

## Карта Курса

| № | Занятие | Новый вопрос | Наблюдаемый результат |
|---:|---|---|---|
| 1 | [Первый запуск](./01-first-start.md) | Как получить первый экран? | В браузере отображается `Hello, @tiyn/app!` |
| 2 | [Application и lifecycle](./02-application-lifecycle.md) | Кто запускает и останавливает приложение? | Видны splash, initialize и dispose |
| 3 | [Router, location и navigation](./03-router-location-navigation.md) | Как URL становится состоянием приложения? | Два route, активный пункт меню и query filter |
| 4 | [Module от простого к рабочему](./04-module.md) | Что принадлежит экрану route? | Экран оформлен как изолированный module package |
| 5 | [DI, bindings и loader](./05-di-bindings-loader.md) | Как runtime-класс получает зависимость и данные? | Список загружается controller-ом без ручного `new` |
| 6 | [Controller actions](./06-controller-actions.md) | Где проходит пользовательская mutation? | Фильтр меняется action-ом с наблюдаемым pending state |
| 7 | [Layout](./07-layout.md) | Как переиспользовать оболочку route-ветки? | Общая навигация не пересоздаётся между экранами |
| 8 | [Widget](./08-widget.md) | Когда React component становится отдельным runtime? | Summary загружается и обновляется независимо от module |
| 9 | [Frame](./09-frame.md) | Как открыть адресуемый overlay поверх route? | Детали заказа открываются по hash и закрываются через shell |
| 10 | [Providers и runtime scopes](./10-providers-scopes.md) | Где живут preload, subscriptions и cleanup? | Widget preload и подписка принадлежат lifecycle boundary |
| 11 | [Store, session и events](./11-state-events.md) | Как связывать независимых участников? | Action публикует событие, подписчик обновляет нужный runtime |
| 12 | [Reactive entities](./12-reactive-entities.md) | Как обновить все живые копии entity? | Event меняет статус без ручного поиска компонентов |
| 13 | [Revalidate](./13-revalidate.md) | Как обновить loader data без подмены navigation? | Module, widget и frame обновляются в собственных границах |
| 14 | [Policies и guards](./14-policies-guards.md) | Где проверять route и local capability? | Route защищён policy, кнопка и action — guard |
| 15 | [Ошибки и application features](./15-errors-features.md) | Кто показывает ошибку и кто выполняет recovery? | Локальная ошибка, общий bus, notification и confirm |
| 16 | [Production composition](./16-production-composition.md) | Как собрать механизмы без смешения ответственности? | Итоговый сценарий и архитектурный разбор |

Нумерация задаёт порядок появления понятий, но одно занятие можно проводить в
несколько встреч. Рекомендуемая длительность — 45–75 минут на занятие, включая
live coding и практику.

## Четыре Уровня Сложности

### Уровень 1. Видимый Результат

Занятия 1–4 отвечают на вопросы «что запустить», «что отображается» и «как URL
управляет экраном». Внутренние scopes и сложные lifecycle-фазы пока не
разбираются.

### Уровень 2. Владельцы Поведения

Занятия 5–9 вводят module, controller, layout, widget и frame. Главный навык —
выбрать владельца сценария, а не запомнить decorator.

### Уровень 3. Время Жизни И Связи

Занятия 10–13 объясняют provider pipeline, scopes, cleanup, events, reactive
entities и revalidate. Здесь слушатель начинает рассуждать не только о
структуре, но и о времени жизни.

### Уровень 4. Production-Границы

Занятия 14–16 добавляют доступ, ошибки, recovery и встроенные features. Финал —
не ещё один API tour, а разбор цельного пользовательского сценария по владельцам
и runtime boundaries.

## Лестница Каждого Компонента

Одинаковая логика применяется отдельно к каждой сущности. Нельзя считать тему
завершённой после показа decorator-а.

| Ступень | Вопрос слушателя | Что показывает ведущий |
|---:|---|---|
| 1 | Что это? | Определение через решаемую проблему |
| 2 | Когда это нужно? | Один подходящий и один неподходящий сценарий |
| 3 | Как выглядит минимум? | Declaration или contract без необязательных частей |
| 4 | Кто создаёт экземпляр? | Различие declaration token и runtime instance |
| 5 | Откуда приходят данные? | Props, loader data, location или injected dependency |
| 6 | Как отправить команду? | Hook во view и service/controller в runtime-коде |
| 7 | Где его scope? | Доступные bindings и владелец lifetime |
| 8 | Как очищаются ресурсы? | Dispose, abort signal или provider cleanup |
| 9 | Как обрабатываются pending/error? | Локальный state и ближайшая UI boundary |
| 10 | Как сочетается с другими runtime? | Реальный составной сценарий |
| 11 | Где границы применения? | Антипример и типичная ошибка выбора |
| 12 | Как выглядит production-вариант? | Код management panel и checklist для review |

### Module

```text
статический Hello view
-> module как leaf route screen
-> module-local bindings
-> controller loader
-> controller action
-> providers и exception UI
-> dispose и повторная активация route
```

Ключевая граница: module — основной экран leaf route. Он не заменяет widget для
переиспользуемого runtime-блока и frame для overlay-сценария.

### Widget

```text
обычный React component
-> причина выделить отдельный runtime
-> typed props и WidgetHost
-> widget controller loader
-> action и local pending state
-> runtimeKey и независимые instances
-> preload
-> widget-local revalidate и error boundary
```

Ключевая граница: не каждый визуальный блок является widget. Если блоку не
нужны собственные loader/action/lifecycle, достаточно React component.

### Frame

```text
overlay как идея
-> Frame + Source + Shell + View
-> typed props
-> регистрация на route
-> useFrame.open/close
-> hash addressability
-> controller и local revalidate
-> parent frame history и back
-> providers, layouts и startup failure
```

Ключевая граница: frame — presentation runtime поверх текущего route, а не
самостоятельный экран. Hash key принадлежит source, а не вызывающему коду.

### Provider

```text
одноразовый side effect
-> setup + cleanup
-> beforeLoad/beforeRender/afterRender
-> provider-local bindings
-> preload
-> повторная route activation
-> singleton provider и reference-counted lease
```

Ключевая граница: provider участвует в lifecycle. Пользовательская business
operation принадлежит controller action или service.

### Policy И Guard

```text
проверка boolean
-> route policy
-> boundary decision
-> inherited route policies
-> local guard в UI
-> guard на controller boundary
-> failure strategy
```

Ключевая граница: policy решает судьбу route boundary, guard защищает локальную
capability внутри уже активного runtime. Скрытая кнопка не заменяет защиту
action.

## Методические Инварианты

- Сначала проблема, затем название framework-механизма.
- На одном live-coding шаге появляется одна новая идея.
- Declaration и runtime instance всегда проговариваются раздельно.
- React view использует hooks; runtime-код использует injected services.
- Navigation меняет URL, revalidate обновляет active loader data.
- Pending, failure и interruption объясняются как разные состояния.
- Cleanup показывается в том же занятии, где появляется subscription или другой
  долгоживущий ресурс.
- Пример импортирует framework API только из `@tiyn/app`.
- Inversify, React Router и MobX называются внутренними реализациями, а не API
  feature-кода.
- Нереализованные command bus, federation event bridge и общий parallel
  readiness barrier не выдаются за возможности framework.

## Контроль Понимания

После каждого занятия слушатель должен уметь ответить не только «как написать»,
но и «почему владелец выбран правильно»:

1. Какая runtime-сущность владеет этим состоянием или процессом?
2. Когда она создаётся и освобождается?
3. Какие данные приходят во view, а какие — через DI?
4. Что произойдёт при повторной навигации, revalidate или dispose?
5. Где появится pending или error UI?
6. Почему соседняя сущность (`module`, `widget`, `frame`, provider) хуже подходит
   для этого сценария?

## Источники Для Ведущего

Перед проведением блока преподаватель сверяет примеры со следующими
документами:

- [ментальная модель](../01-mental-model.md);
- [application](../02-application.md);
- [router и navigation](../03-router-and-navigation.md);
- [modules, controllers и providers](../04-modules-controllers-providers.md);
- [widgets](../05-widgets.md);
- [frames](../06-frames.md);
- [DI, state и events](../07-di-runtime-state-events.md);
- [policies, revalidate и errors](../08-policies-revalidate-errors.md);
- [guards](../11-guards.md);
- [reactive entities](../18-reactive-entities.md);
- [аудит public API](../17-public-api-audit.md).

Примеры production-композиции следует дополнительно сравнивать с текущими
packages management panel. Они показывают реальное применение, но не заменяют
framework contract.

## Готовность Курса

Перед проведением полного курса должны быть подготовлены:

- отдельный slide deck или Markdown-сценарий каждого занятия;
- рабочая ветка учебного приложения с checkpoint на каждое занятие;
- команды запуска и reset между демонстрациями;
- ответы к упражнениям;
- итоговый production-like сценарий;
- лист наблюдений преподавателя: типичные ошибки и места, где группа теряет
  ментальную модель.
