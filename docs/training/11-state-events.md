# Занятие 11. Application Store, Session И Events

- Статус документа: current
- Формат: 75 минут
- Уже известно: DI, provider lifecycle и cleanup
- Новые понятия: application store, session phase/revision, event token,
  publish/subscribe, `ApplicationEventScope`

## Результат Занятия

После изменения заказа action публикует `OrderUpdatedEvent`, а независимый
provider подписывается на него с корректным cleanup. Слушатель не смешивает
session phase, resolved application data и integration events.

---

## Слайд 1. Три Разные Задачи

### На Экране

```text
SessionRuntimeState  -> phase + revision сессии
ApplicationStore     -> resolved application-level data
ApplicationEventBus  -> сообщение независимым participants
```

### Заметки Ведущего

Не начинайте с event syntax. Сначала разберите владельца данных. Profile и
permissions не относятся к session phase; событие не является storage.

---

## Слайд 2. Session Хранит Только Phase

### На Экране

```ts
session.phase; // unknown | anonymous | authenticated
session.setUnknown();
session.setAnonymous();
session.setAuthenticated();
```

### Заметки Ведущего

Изменение session увеличивает runtime revision. Позже это позволит отличить
ошибку устаревшей операции от настоящего failure. Не кладите сюда profile,
tenant или permissions.

---

## Слайд 3. Application Store Для Resolved Data

### На Экране

```ts
store.set(ProfileEntity, profile);
store.get(ProfileEntity);

store.setMany(PermissionEntity, permissions);
store.getMany(PermissionEntity);
```

### Заметки Ведущего

Store использует class key, но не знает бизнес-смысл данных. Logout и tenant
switch должны явно удалить свои entries. Store — не замена loader data каждого
module.

---

## Слайд 4. Event Token

### На Экране

```ts
export abstract class OrderUpdatedEvent {
  declare readonly id: string;
}
```

### Заметки Ведущего

Class token адресует тип события в runtime и одновременно типизирует payload.
Publisher не знает подписчиков.

---

## Слайд 5. Publish Из Action

### На Экране

```ts
constructor(
  @Inject(ApplicationEventBusInterface)
  private readonly events: ApplicationEventBusInterface,
) {}

async action({ payload }) {
  await this.orders.update(payload);
  await this.events.publish(OrderUpdatedEvent, {
    id: payload.id,
  });
}
```

### Заметки Ведущего

Сначала выполняется business operation, затем событие о состоявшемся факте.
Event bus — integration layer, а не command bus; command bus не является
готовым API `@tiyn/app`.

---

## Слайд 6. Subscribe С Lifecycle Owner

### На Экране

```ts
@Provider()
class OrdersEventsProvider
  extends RuntimeProviderInterface {
  setup(): RuntimeProviderResult {
    const scope = this.events
      .createScope()
      .subscribe(OrderUpdatedEvent, this.handleUpdate.bind(this));

    return () => scope.dispose();
  }
}
```

### Заметки Ведущего

`ApplicationEventScope` группирует subscriptions, disposable и idempotent.
Новые подписки после dispose запрещены. Для одной подписки можно вернуть
disposable напрямую.

---

## Слайд 7. Event Не Говорит, Как Обновлять UI

### На Экране

```text
OrderUpdatedEvent
├── revalidate loader data
├── update reactive entity
├── log/analytics
└── ignore, если owner не активен
```

### Заметки Ведущего

Каждый subscriber выбирает реакцию. В этом занятии просто выведите событие и
покажите cleanup. На следующих занятиях сравните reactive update и revalidate.

---

## Слайд 8. Ошибки Handler Не Меняют Publisher Contract

### На Экране

```text
handler failed
-> runtime reporter получает diagnostic report
-> publisher не знает конкретного subscriber
```

### Заметки Ведущего

Не стройте business transaction из произвольной цепочки event handlers. Если
результат обязателен для команды, он должен оставаться частью явного service или
action flow.

---

## Слайд 9. Практика

1. Сохранить profile в application store initializer-ом.
2. Отдельно установить session phase.
3. Создать `OrderUpdatedEvent`.
4. Опубликовать событие после action.
5. Подписаться provider-ом и проверить cleanup при уходе с route.
6. Объяснить, почему event payload не нужно хранить в session state.

### Мост К Следующей Теме

Событие содержит обновлённый заказ. Нужно изменить все живые копии entity без
поиска конкретного loader result — это задача reactive entities.

## Источники Ведущего

- [DI, state и events](../07-di-runtime-state-events.md)
- [Application store и session](../02-application.md)
- [Runtime provider cleanup](../04-modules-controllers-providers.md)
