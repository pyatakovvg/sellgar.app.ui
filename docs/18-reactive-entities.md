# Реактивные Сущности

`@Entity` объявляет объект доменной модели реактивной сущностью. Декларация не
связывает сущность с коллекцией, loader, transport или React-компонентом.

## Декларация

```ts
import { Entity } from '@sellgar/app';

@Entity()
export class TerminalEntity {
  id: string;
  status: string;
}
```

Все объявленные поля экземпляра автоматически становятся независимыми
observable-ссылками. Property-декораторы MobX в entity-классе не нужны.

По умолчанию identity читается из поля `id`. Если сущность использует другое
поле, оно указывается явно:

```ts
@Entity({ identity: 'userId' })
export class ProfileEntity {
  userId: number;
}
```

Декоратор проверяет, что identity-поле существует в классе и имеет тип `string`
или `number`.

Constructor wrapper сразу создаёт внутреннюю registration. Если identity ещё
не заполнена, registration ожидает её установки mapper-ом или
`class-transformer`. После первого значения identity становится неизменяемой.

## Семантика Полей

Поля инструментируются как `observable.ref`:

- замена `terminal.status` уведомляет только reactions, прочитавшие `status`;
- замена `terminal.location` уведомляет reactions, прочитавшие `location`;
- изменение `terminal.location.address` внутри прежнего объекта отдельно не
  отслеживается.

Вложенное значение нужно заменять целиком. Если вложенный объект имеет
самостоятельную identity и обновляется независимо, он может быть отдельной
`@Entity`.

## Регистрация Экземпляров

Каждый реализованный instance регистрируется автоматически. Loader, controller,
service и view не вызывают `add`, `resolve`, `subscribe` или `dispose`:

```text
TerminalEntity
└── terminal-42
    ├── instance A
    └── instance B
```

Registry хранит `WeakRef`, а не сильные ссылки. Когда instance становится
недостижим и собирается JavaScript runtime, `FinalizationRegistry` удаляет его
registration. Мёртвые weak references также очищаются во время обновления.

Это не коллекция данных и не cache. Если update пришёл до создания instance, он
не сохраняется.

## Обновление

```ts
import { updateEntity } from '@sellgar/app';

updateEntity(TerminalEntity, {
  id: 'terminal-42',
  status: 'offline',
});
```

`updateEntity` читает identity из данных, находит все живые instances этого
класса с такой identity и обновляет их внутри одной MobX action.

Источник данных находится за границей слоя. Ручной код, HTTP, polling, socket
или тест вызывают одинаковый `updateEntity(EntityClass, data)`.

Identity обновлением не изменяется. Неизвестное поле считается ошибкой
контракта вызывающего кода.

## Коллекции

Коллекция объявляется отдельно от entity и указывает, какое поле содержит её
instances:

```ts
import { Entity, EntityCollection } from '@sellgar/app';

@Entity()
export class IncidentEntity {
  id: string;
  status: string;
}

@EntityCollection({ entity: IncidentEntity, property: 'items' })
export class IncidentsEntity {
  items: IncidentEntity[];
}
```

Каждый созданный `IncidentsEntity` регистрируется автоматически после
заполнения `items`. Registry хранит коллекции через `WeakRef` и не превращает
reactive layer в cache.

Добавление и удаление сохраняют ту же data-unbound форму, что и
`updateEntity`: вызывающий код передаёт entity class, но не ищет конкретный
loader result или экземпляр коллекции.

```ts
import { insertEntity, removeEntity } from '@sellgar/app';

insertEntity(IncidentEntity, incident, { position: 'start' });
removeEntity(IncidentEntity, { id: incidentId });
```

`IncidentEntity` здесь является ключом registry, а не коллекцией назначения.
Каждый instance класса с `@EntityCollection({ entity: IncidentEntity, ... })`
регистрируется под этим ключом. Поэтому операции находят и изменяют все живые
коллекции, объявленные для `IncidentEntity`, включая разные collection classes,
если они используют один entity class.

`insertEntity` добавляет instance во все подходящие живые коллекции указанного
entity class. Без `scopeBy` подходящими считаются все коллекции этого entity
class. При повторной вставке той же identity существующие instances обновляются,
а второй элемент в коллекцию не добавляется. `removeEntity` принимает объект с
identity-полем entity и удаляет matching identity из всех живых коллекций. Обе
операции заменяют массивы атомарно, поэтому reactive views видят согласованное
изменение состава.

Если один entity class используется несколькими независимыми коллекциями,
`scopeBy` связывает их по общему scalar-полю:

```ts
@EntityCollection({
  entity: MessageEntity,
  property: 'items',
  scopeBy: 'chatId',
})
export class MessageHistoryEntity {
  chatId: string;
  items: MessageEntity[];
}
```

`insertEntity(MessageEntity, message)` в этом случае добавляет сообщение только
в живые коллекции, чей `chatId` совпадает с `message.chatId`. Вставка остаётся
data-unbound: вызывающий код не передаёт collection instance или scope metadata.

Если поля владельца и вложенной entity называются по-разному, `scopeBy`
описывает их соответствие:

```ts
@EntityCollection({
  entity: TransactionEntity,
  property: 'transactions',
  scopeBy: {
    entity: 'operationId',
    owner: 'id',
  },
})
@Entity()
export class OperationEntity {
  id: string;
  status: string;
  transactions: TransactionEntity[];
}
```

Один класс может одновременно быть реактивной entity и владельцем коллекции.
`updateEntity(OperationEntity, data)` обновляет поля самой операции, а
`insertEntity(TransactionEntity, transaction)` изменяет только коллекцию
операции, чей `id` совпадает с `transaction.operationId`. Порядок этих двух
class-декораторов не влияет на поведение.

Как и updates, событие до создания коллекции не сохраняется. Произвольные
фильтры, сортировка и пагинация не являются задачей collection registry.

## React Bridge

View использует framework bridge и не импортирует MobX:

```tsx
import { reactive } from '@sellgar/app';

export const TerminalStatus = reactive(function TerminalStatus() {
  const { data: terminal } = useCellData<TerminalEntity>();

  return <Badge label={terminal.status} />;
});
```

MobX reaction запоминает прочитанные поля. Изменение `status` перерисует этот
компонент, но не компоненты, прочитавшие только другие поля entity.
