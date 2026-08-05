# Занятие 12. Reactive Entities: Обновление Живых Экземпляров

- Статус документа: current
- Формат: 60–75 минут
- Уже известно: events и loader data
- Новые понятия: `@Entity`, identity, `updateEntity`, `@EntityCollection`,
  `insertEntity`, `removeEntity`, `reactive`

## Результат Занятия

Событие обновления заказа изменяет все живые экземпляры `OrderEntity` с одной
identity. React перерисовывает только view, прочитавшие изменённые поля.

---

## Слайд 1. Проблема Дублирующихся Экземпляров

### На Экране

```text
Order 100 находится одновременно:
- в module loader data
- во widget
- во frame details

Пришёл update статуса. Кого искать?
```

### Заметки Ведущего

Reactive layer решает обновление уже существующих живых entity. Он не является
backend cache и не сохраняет событие, пришедшее до создания экземпляра.

---

## Слайд 2. Declaration И Identity

### На Экране

```ts
@Entity()
export class OrderEntity {
  id!: string;
  number!: string;
  status!: string;
}
```

```ts
@Entity({ identity: 'orderId' })
class LegacyOrderEntity {
  orderId!: number;
}
```

### Заметки Ведущего

По умолчанию identity — `id`, тип `string | number`. После первого заполнения
identity неизменяема. Registration создаётся автоматически и хранит только
weak reference.

---

## Слайд 3. Поля Наблюдаются Как References

### На Экране

```text
order.status = 'paid'              -> наблюдается
order.address = newAddress         -> наблюдается
order.address.city = 'Москва'      -> отдельно не наблюдается
```

### Заметки Ведущего

Поля инструментируются как `observable.ref`. Вложенный объект нужно заменить
целиком либо объявить отдельной entity, если у него есть identity и независимые
updates.

---

## Слайд 4. Data-Unbound Update

### На Экране

```ts
updateEntity(OrderEntity, {
  id: '100',
  status: 'paid',
});
```

### Заметки Ведущего

Вызывающий код не передаёт конкретный instance. Framework находит все живые
экземпляры класса и identity. Неизвестное поле — contract error; identity не
изменяется.

### Live Coding

В `OrdersEventsProvider` обработайте `OrderUpdatedEvent` через `updateEntity`.
Покажите синхронное изменение строки списка и открытого frame.

---

## Слайд 5. React Bridge Скрывает MobX

### На Экране

```tsx
export const OrderStatus = reactive(function OrderStatus({ order }) {
  return <span>{order.status}</span>;
});
```

### Заметки Ведущего

Feature code импортирует `reactive` из `@sellgar/app`, а не MobX. Reaction
запоминает реально прочитанные поля: компонент, читающий только `number`, не
обязан обновляться при смене `status`.

---

## Слайд 6. Коллекции — Отдельная Declaration

### На Экране

```ts
@EntityCollection({
  entity: OrderEntity,
  property: 'items',
})
export class OrdersEntity {
  items!: OrderEntity[];
}
```

```ts
insertEntity(OrderEntity, order, { position: 'start' });
removeEntity(OrderEntity, { id: orderId });
```

### Заметки Ведущего

Операции изменяют все подходящие живые коллекции. Повторная вставка той же
identity обновляет existing instance, а не добавляет duplicate.

---

## Слайд 7. Scoped Collections

### На Экране

```ts
@EntityCollection({
  entity: MessageEntity,
  property: 'items',
  scopeBy: 'chatId',
})
class MessageHistoryEntity {
  chatId!: string;
  items!: MessageEntity[];
}
```

### Заметки Ведущего

`scopeBy` нужен, когда один entity class используется независимыми
коллекциями. Произвольная фильтрация, сортировка и pagination не являются
задачей registry.

---

## Слайд 8. Reactive Update Или Revalidate?

### На Экране

```text
updateEntity
  известен конкретный entity update

revalidate
  нужно заново получить authoritative loader data
```

### Заметки Ведущего

Это мост к следующему занятию. Reactive update экономит запрос и мгновенно
синхронизирует copies. Revalidate нужен для пересчёта выборки, permissions,
pagination или неизвестного набора изменений.

---

## Слайд 9. Практика

1. Объявить `OrderEntity` и `OrdersEntity`.
2. Сделать status component через `reactive`.
3. Обработать update event.
4. Вставить и удалить заказ из живой коллекции.
5. Отправить update до создания entity и объяснить, почему он не появился
   позднее.

## Источники Ведущего

- [Reactive entities](../18-reactive-entities.md)
- [Application events](../07-di-runtime-state-events.md#event-bus-приложения)

