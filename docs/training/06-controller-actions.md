# Занятие 6. Controller Actions И Submit State

- Статус документа: current
- Формат: 60 минут
- Уже известно: DI, bindings, controller loader
- Новые понятия: action payload/result, `useSubmit`, shared submit state,
  runtime navigation service

## Результат Занятия

Фильтр заказов отправляется через controller action. View показывает pending и
ошибку, а URL меняет injected `NavigateServiceInterface`.

---

## Слайд 1. Loader Читает, Action Изменяет

### На Экране

```text
loader
  подготовить данные для view

action
  выполнить mutation/command из view
```

### Заметки Ведущего

Не привязывайте action только к HTTP mutation. Изменение адресуемого фильтра —
тоже команда и удобный безопасный первый пример.

---

## Слайд 2. Маленький Controller На Одну Команду

### На Экране

```ts
interface ApplyOrdersFilterPayload {
  query: string;
}

abstract class ApplyOrdersFilterControllerInterface implements ControllerInterface {
  abstract action(args: ControllerActionArgs<ApplyOrdersFilterPayload>): Promise<void>;
}
```

### Заметки Ведущего

Если actions независимы, несколько маленьких controllers понятнее большого
switch по `actionType`. Token одновременно адресует action transport и его
submit state.

---

## Слайд 3. Runtime-Код Использует Service, Не Hook

### На Экране

```ts
@Controller()
export class ApplyOrdersFilterController extends ApplyOrdersFilterControllerInterface {
  constructor(
    @Inject(NavigateServiceInterface)
    private readonly navigate: NavigateServiceInterface,
  ) {
    super();
  }

  async action({ payload }: ControllerActionArgs<ApplyOrdersFilterPayload>) {
    await this.navigate.searchParams({ query: payload.query, page: 1 }, { merge: true });
  }
}
```

### Заметки Ведущего

Свяжите с занятием 3: view использует `useNavigate`, runtime class получает
`NavigateServiceInterface` через DI.

---

## Слайд 4. View Использует `useSubmit`

### На Экране

```tsx
const applyFilter = useSubmit(ApplyOrdersFilterControllerInterface);

<button disabled={applyFilter.inProcess} onClick={() => applyFilter({ query })}>
  {applyFilter.inProcess ? 'Применяем…' : 'Применить'}
</button>;
```

### Заметки Ведущего

Submit — function со state: `inProcess`, `data`, `error`. View вызывает команду
и отображает состояние, но не создаёт controller и не знает transport.

---

## Слайд 5. State Общий Для Token И Runtime

### На Экране

```text
один active ModuleRuntime
+ один controller token
= один submit snapshot
```

### Заметки Ведущего

Два компонента, вызвавшие `useSubmit` с одним token внутри одного module,
увидят общий `inProcess/data/error`. Во время active submit второй вызов будет
отклонён. Это защита runtime transport, но кнопку всё равно нужно disable для
понятного UX.

---

## Слайд 6. Ошибка Action Не Обязательно Ломает Экран

### На Экране

```tsx
{
  applyFilter.error && <p role="alert">Не удалось применить фильтр</p>;
}
```

### Заметки Ведущего

Ошибки submit остаются recoverable в hook state. Runtime action boundary
сформирует diagnostic report, но application-level reaction через глобальную
подписку не запускается; локальная форма показывает собственное сообщение.

---

## Слайд 7. Кто Обновляет Данные После Mutation

### На Экране

```text
action меняет только URL
-> route flow может перечитать данные

action меняет backend data
-> владелец сценария явно запрашивает revalidate
```

### Заметки Ведущего

Не добавляйте пока revalidate-код. Зафиксируйте правило одного владельца:
controller либо view запускает обновление, но не оба без отдельной причины.

---

## Слайд 8. Практика

1. Создать отдельный filter action controller.
2. Зарегистрировать binding в `OrdersBindings`.
3. Отправить typed payload через `useSubmit`.
4. Показать pending и local error.
5. Сделать искусственную задержку и попытаться отправить action дважды.

### Контрольные Вопросы

- Почему action controller — не service и не event handler?
- Где находится общий submit state?
- Почему runtime-код не использует `useNavigate`?
- Кто должен инициировать revalidate после mutation?

### Мост К Следующей Теме

Навигация дублируется между module views. Теперь у аудитории есть реальная
мотивация вынести общую route shell в layout.

## Источники Ведущего

- [Controller actions](../04-modules-controllers-providers.md)
- [Navigation в runtime-коде](../03-router-and-navigation.md)
- [Runtime errors](../08-policies-revalidate-errors.md)
