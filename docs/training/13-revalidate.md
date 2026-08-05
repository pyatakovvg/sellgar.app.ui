# Занятие 13. Revalidate: Обновление Ближайшего Runtime

- Статус документа: current
- Формат: 60–75 минут
- Уже известно: loaders, module/widget/frame scopes, reactive updates
- Новые понятия: `useRevalidate`, `RevalidateServiceInterface`, targeted
  revalidate, ownership

## Результат Занятия

Слушатель обновляет loader data module, widget и frame в правильной runtime
границе и не использует navigation как подмену revalidate.

---

## Слайд 1. Revalidate Отвечает На Один Вопрос

### На Экране

```text
«Перезапусти loader data активной runtime entity»

Не:
- изменить URL
- обновить все runtime дерева
- повторить provider setup
```

### Заметки Ведущего

Nearest scope выбирает реализацию общего token. Поэтому одинаковый hook/service
имеет локальный результат в module, widget и frame.

---

## Слайд 2. Во View

### На Экране

```tsx
const revalidate = useRevalidate();

<button
  disabled={revalidate.inProcess}
  onClick={() => revalidate()}
>
  Обновить
</button>
```

```ts
revalidate.inProcess;
revalidate.error;
```

### Заметки Ведущего

View получает command и process state. Ошибка revalidate recoverable: текущие
ready data могут остаться на экране.

---

## Слайд 3. В Runtime-Коде

### На Экране

```ts
constructor(
  @Inject(RevalidateServiceInterface)
  private readonly revalidate: RevalidateServiceInterface,
) {}

await this.revalidate.revalidate({ signal: args.signal });
```

### Заметки Ведущего

Controller использует injected service. Передача signal связывает refresh с
текущей action/runtime operation.

---

## Слайд 4. Один Token — Три Локальных Результата

### На Экране

```text
ModuleScope -> active route/module loader
WidgetScope -> только widget loader
FrameScope  -> только active frame loader
```

### Заметки Ведущего

Widget revalidate не обновляет module. Frame revalidate не обновляет вложенные
widgets. Это не недостаток: runtime boundaries сохраняют локальность.

---

## Слайд 5. Targeted Module Revalidate

### На Экране

```ts
await revalidateService.revalidate();
await revalidateService.revalidate(OrdersControllerInterface);
```

### Заметки Ведущего

Для module внешний router adapter может перезапустить active route loader.
Feature code не должен зависеть от внутреннего частичного controller reload.

---

## Слайд 6. Один Владелец На Сценарий

### На Экране

```text
Вариант A:
action -> mutation -> revalidate

Вариант B:
view -> submit -> revalidate

Не A + B одновременно без причины.
```

### Заметки Ведущего

Предпочтите controller ownership, если refresh является обязательной частью
успешной mutation. View ownership подходит для отдельной кнопки «Обновить».

---

## Слайд 7. Navigation Не Revalidate

### На Экране

```text
navigate.hashParams(...) -> URL изменился
revalidate()              -> loader data обновились
```

### Заметки Ведущего

Повторная навигация на тот же URL может иметь router-specific pending behavior,
но feature intent должен быть явным. Особенно важно для hash-only frame flow.

---

## Слайд 8. Revalidate Не Повторяет Setup

### На Экране

```text
same runtime pipeline:
controller loader повторяется
provider setup не повторяется
```

### Заметки Ведущего

Вернитесь к provider lifecycle. Если обновление данных требует пересоздать
subscription, это либо отдельная логика provider, либо признак неверного owner.

---

## Слайд 9. Практика

1. Добавить кнопку module refresh.
2. Добавить widget-local refresh и сравнить network calls.
3. После frame action обновить только frame.
4. Показать revalidate error без потери предыдущих ready data.
5. Найти и удалить двойной revalidate из action и view.

### Мост К Следующей Теме

Данные обновляются корректно, но доступ пока одинаков для всех. Следующий шаг —
route policies и local guards с разными enforcement boundaries.

## Источники Ведущего

- [Revalidate](../08-policies-revalidate-errors.md#revalidate-runtime-entity)
- [Widget revalidate](../05-widgets.md#revalidate-из-controller)
- [Frame revalidate](../06-frames.md#revalidate-frame)

