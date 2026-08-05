# Занятие 14. Policies И Guards: Две Границы Доступа

- Статус документа: current
- Формат: 75–90 минут
- Уже известно: route и local runtime boundaries
- Новые понятия: policy result/decision, `canMatch/canActivate/canAction`, guard,
  `@UseGuards`, `useGuard`, `Guarded`, failure strategy

## Результат Занятия

Orders route требует authenticated session и permission. Кнопка создания
скрывается guard-ом, а controller action защищён тем же capability независимо
от UI.

---

## Слайд 1. Policy И Guard Не Взаимозаменяемы

### На Экране

```text
Policy -> можно ли пройти route boundary
Guard  -> доступна ли local capability внутри active runtime
```

### Заметки Ведущего

Первый вопрос занятия: «Достаточно ли скрыть кнопку?» Нет — UI check улучшает
UX, controller boundary обеспечивает выполнение правила.

---

## Слайд 2. Policy Возвращает Result

### На Экране

```ts
@Policy()
class RequireAuthenticatedSessionPolicy
  extends PolicyInterface {
  execute(): PolicyResult {
    return this.session.phase === 'authenticated'
      ? { type: 'pass' }
      : { type: 'fail', reason: 'Anonymous session' };
  }
}
```

### Заметки Ведущего

Policy проверяет условие, но сама не обязана выполнять navigation. Result
handler преобразует pass/fail/error в route boundary decision.

---

## Слайд 3. Три Route Slots

### На Экране

```ts
new Route({
  canMatch: [RequireAuthenticatedSessionPolicy],
  canActivate: [CanViewOrdersPolicy],
  canAction: [CanEditOrdersPolicy],
  load: () => import('@module/orders'),
});
```

### Заметки Ведущего

- `canMatch`: можно ли матчить и загружать module.
- `canActivate`: можно ли активировать runtime.
- `canAction`: можно ли выполнить route/module action.

Policies наследуются вниз по route branch.

---

## Слайд 4. Boundary Decision Отдельна От Проверки

### На Экране

```ts
RequireAuthenticatedSessionPolicy.configure().onFail(
  Router.redirectTo('/sign-in', {
    replace: true,
    saveCurrentLocation: true,
  }),
)
```

### Заметки Ведущего

Другие decisions: continue, redirectToSaved, forbidden, notFound, error.
Разделение позволяет переиспользовать policy с разной реакцией на boundary.

`Router.firstAvailable()` полезен для branch, где первый доступный child зависит
от `canMatch`.

---

## Слайд 5. Guard Возвращает Boolean

### На Экране

```ts
@Guard()
class CanCreateOrderGuard
  extends GuardInterface<{ section: string }> {
  execute(context): GuardResult {
    return this.permissions.canCreate(context.section);
  }
}
```

### Заметки Ведущего

`false` — нормальный отказ. Исключение — ошибка выполнения guard. Concrete
`@Guard()` может auto-bind-иться в текущем runtime scope.

---

## Слайд 6. UX Check И Enforcement

### На Экране

```tsx
const canCreate = useGuard(CanCreateOrderGuard, {
  section: 'orders',
});
```

```ts
@UseGuards(CanCreateOrderGuard)
async action(args: ControllerActionArgs<CreateOrderPayload>) {
  // реальная команда
}
```

### Заметки Ведущего

Hook отвечает за show/hide или enable/disable. Decorator читается framework на
controller loader/action boundary. На private helper он не сработает.

---

## Слайд 7. Declarative Guarded

### На Экране

```tsx
<Guarded
  by={CanCreateOrderGuard}
  context={{ section: 'orders' }}
  fallback={<span>Нет доступа</span>}
>
  <CreateOrderButton />
</Guarded>
```

### Заметки Ведущего

Массив guards выполняется как AND с остановкой на первом `false`. Public OR/any
нет; альтернативное правило инкапсулируется отдельным guard.

---

## Слайд 8. Failure Strategy

### На Экране

```ts
GuardFailure.throw();
GuardFailure.returnNull();
GuardFailure.returnUndefined();
GuardFailure.returnValue(value);
```

### Заметки Ведущего

Default — `GuardRejectedException`. Возвращаемая стратегия полезна для
optional loader sections, но не должна маскировать обязательную security
boundary.

---

## Слайд 9. Практика

1. Защитить private branch session policy.
2. Настроить redirect на sign-in с сохранением URL.
3. Добавить permission policy на `/orders`.
4. Скрыть кнопку создания guard-ом.
5. Защитить action тем же capability.
6. Вызвать action в обход UI и убедиться, что guard остаётся enforcement.

### Мост К Следующей Теме

Отказ доступа теперь управляем, но network/runtime failures требуют другой
модели: local error UI, application recovery, diagnostics и уведомления.

## Источники Ведущего

- [Policies и boundary decisions](../08-policies-revalidate-errors.md#policies)
- [Guards](../11-guards.md)
- [Router inheritance](../03-router-and-navigation.md#наследование-route)

