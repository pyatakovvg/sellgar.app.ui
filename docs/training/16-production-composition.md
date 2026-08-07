# Занятие 16. Production Composition: Цельный Сценарий

- Статус документа: current
- Формат: 90–120 минут
- Предпосылка: пройдены занятия 1–15
- Новые понятия: не вводятся; занятие проверяет выбор владельцев и composition

## Результат Занятия

Группа собирает и защищает сценарий «найти заказ → открыть детали → изменить
статус → синхронизировать UI → обработать ошибку» и объясняет каждое решение
через runtime owner, scope и lifecycle.

## Сценарий

```text
1. Пользователь открывает /orders?query=100
2. Policy разрешает route
3. Module loader получает список
4. Summary widget уже preloaded
5. Пользователь открывает details frame
6. Frame loader получает заказ 100
7. Guard разрешает mutation
8. Confirm запрашивает подтверждение
9. Action изменяет статус
10. Event обновляет reactive entities
11. Frame revalidate получает authoritative details
12. Notification сообщает об успехе
13. Frame закрывается
```

---

## Слайд 1. Сначала Назвать Владельцев

### На Экране

| Часть                 | Владелец                  |
| --------------------- | ------------------------- |
| startup/session       | Application + initializer |
| URL и доступ к экрану | Router/Route + policy     |
| список                | OrdersModule + controller |
| summary               | OrdersSummaryWidget       |
| details overlay       | OrderDetailsFrame         |
| preload/subscription  | provider                  |
| local capability      | guard                     |
| cross-runtime факт    | application event         |
| живые копии заказа    | reactive entity layer     |
| authoritative refresh | nearest revalidate        |

### Заметки Ведущего

До кода группа должна согласовать таблицу. Если owner неочевиден, остановите
реализацию и сравните альтернативы по lifetime и boundary.

---

## Слайд 2. End-To-End Runtime Flow

### На Экране

```text
URL
-> route policies
-> module provider beforeLoad
-> module controller loaders
-> provider setup/beforeRender
-> module + widget render
-> frame source activation
-> frame controller loader
-> guarded frame action
-> event + reactive update + revalidate
-> cleanup on close/leave
```

### Заметки Ведущего

Попросите указать abort signal и cleanup на каждом async/long-lived шаге.

---

## Слайд 3. Public API Boundary

### На Экране

```ts
import { Controller, Frame, Inject, Module, Provider, Widget } from '@tiyn/app';
```

```text
Не импортировать feature-коду:
- inversify
- react-router internals
- mobx
- private src/* файлы @tiyn/app
```

### Заметки Ведущего

Public API — архитектурная граница, а не cosmetic barrel. Проверяйте каждый
пример и package import.

---

## Слайд 4. Package Boundaries

### На Экране

```text
clients/orders-training  composition root
layouts/main             route shell
modules/orders           route screen
widgets/orders-summary   reusable runtime block
frames/order-details     overlay scenario
library/domain           contracts/services/entities
```

### Заметки Ведущего

Package экспортирует декларацию и действительно нужные consumer contracts.
Private controllers, bindings, view components и provider implementations не
нужно раскрывать автоматически.

---

## Слайд 5. Happy Path Live Coding

### Задание Ведущего

Соберите сценарий без искусственных failures:

1. Откройте orders route.
2. Примените query filter action.
3. Откройте frame.
4. Подтвердите изменение статуса.
5. Опубликуйте event.
6. Обновите entity и frame loader data.
7. Покажите notification и закройте frame.

После каждого шага группа называет active runtime и owner state.

---

## Слайд 6. Failure Injection

### На Экране

```text
Сломать по очереди:
- module loader
- widget loader
- frame loader
- action
- event handler
- provider cleanup
- session во время request
```

### Заметки Ведущего

Для каждого failure спросите:

1. Какая UI boundary сработает?
2. Какой owner/participant/operation попадёт в source?
3. Какой disposition и diagnostic report ожидается?
4. Останутся ли previous ready data?
5. Требуется ли cleanup?
6. Failure это или interruption?

---

## Слайд 7. Review По Антипримерам

### На Экране

```text
Найти и исправить:
- module для обычной кнопки
- widget без собственного runtime
- frame как основной route screen
- provider как click command
- navigation вместо revalidate
- hidden button без guarded action
- subscription без owner cleanup
- profile внутри session state
- deep import из @tiyn/app/src
```

### Заметки Ведущего

Этот слайд лучше проводить как code review, а не лекцию. Дайте группе намеренно
плохой diff и попросите классифицировать нарушение до исправления.

---

## Слайд 8. Финальное Практическое Задание

### Задача

Добавить сценарий `OrderPaymentFrame`:

- открывается из `OrderDetailsFrame`;
- принимает typed `orderId`;
- загружает платёжные данные controller-ом;
- требует local payment guard;
- спрашивает confirm;
- выполняет action;
- публикует `OrderPaidEvent`;
- обновляет `OrderEntity`;
- возвращается в parent frame через `back()`;
- обновляет parent frame authoritative data;
- показывает success notification;
- корректно переживает Unauthorized interruption.

### Критерии Оценки

- правильно выбраны module/widget/frame boundaries;
- bindings локальны владельцу;
- view использует hooks, runtime-классы — injected services;
- request signal передан в async operations;
- subscription имеет cleanup;
- action защищён независимо от UI;
- нет двойного revalidate;
- public imports идут через package facades;
- ошибки и interruption дают разные наблюдаемые результаты.

---

## Слайд 9. Устная Защита Решения

Каждый участник отвечает:

1. Почему сценарий является frame, а не module или widget?
2. Где создаётся frame runtime и что определяет его identity?
3. Какие bindings видит frame controller, а какие provider?
4. Что происходит при refresh active hash URL?
5. Почему reactive update не отменяет authoritative revalidate?
6. Что будет освобождено при `close()`, `back()` и уходе с route?
7. Что изменится, если обычный provider сделать singleton provider?

---

## Слайд 10. После Курса

### На Экране

```text
Перед новой feature:
problem -> owner -> boundary -> lifecycle -> API
```

### Заметки Ведущего

Курс завершён, когда разработчик начинает с выбора владельца, а не с поиска
decorator-а. API details после этого действительно можно читать в reference
документации.

## Checklist Ведущего

- Все примеры были запущены, а не только показаны на слайдах.
- Каждый долгоживущий ресурс продемонстрировал cleanup.
- Группа увидела local ошибки module/widget/frame.
- Был показан session interruption во время async operation.
- Хотя бы один антипример разобран через code review.
- Итоговое задание защищено устно, а не только сдано кодом.

## Источники Ведущего

- [Руководство разработчика](../README.md)
- [Recipes](../09-recipes.md)
- [File structure и public API](../10-file-structure.md)
- [Public API audit](../17-public-api-audit.md)
- Текущие `modules/*`, `widgets/*`, `frames/*`, `layouts/*` management panel
