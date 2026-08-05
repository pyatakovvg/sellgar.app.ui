# Занятие 3. Router, Location И Navigation

- Статус документа: current
- Формат: 60–75 минут
- Уже известно: application lifecycle и один index route
- Новые понятия: branch/leaf route, nested route, `useLocation`, `useNavigate`,
  `NavItem`, search params

## Результат Занятия

Учебное приложение имеет `/welcome` и `/orders`, сохраняет фильтр заказов в
query string и показывает active/pending состояние навигации без прямого
использования React Router.

---

## Слайд 1. URL — Состояние, А Не Побочный Эффект

### На Экране

```text
/orders?page=2&query=paid

pathname  -> какой экран
search    -> состояние списка
hash      -> позднее: active frame
```

### Заметки Ведущего

Поясните выгоду: адрес можно сохранить, обновить и передать другому человеку.
Не переносите всё UI state в URL; показывайте только состояние, которое должно
быть адресуемым.

---

## Слайд 2. Branch И Leaf

### На Экране

```text
branch route
  содержит child routes

leaf route
  загружает module через load()
```

```ts
new Route({
  path: '/',
  routes: [
    new Route({ path: '/welcome', load: () => import('@module/welcome') }),
    new Route({ path: '/orders', load: () => import('@module/orders') }),
  ],
});
```

### Заметки Ведущего

`routes` и `load` взаимоисключающие. Branch группирует subtree; leaf выбирает
экран. На этом шаге оба module остаются статическими.

---

## Слайд 3. Default Route

### На Экране

```ts
new Route({
  path: '/',
  defaultTo: '/welcome',
  routes: [/* children */],
});
```

### Заметки Ведущего

При точном попадании в `/` framework выполняет replace на `/welcome` до module
loaders и providers. `defaultTo` принадлежит branch route. Более сложный
`Router.firstAvailable()` отложите до policies.

---

## Слайд 4. Navigation Во View

### На Экране

```tsx
const navigate = useNavigate();

<button onClick={() => navigate.to('/orders')}>
  Заказы
</button>
```

```tsx
<NavItem to="/orders">
  {({ isActive, isPending, to }) => (
    <button
      data-active={isActive}
      data-pending={isPending}
      onClick={() => navigate.to(to)}
    >
      Заказы
    </button>
  )}
</NavItem>
```

### Заметки Ведущего

Feature view не импортирует React Router. `NavItem` headless: он не создаёт DOM
wrapper, а сообщает состояние render function.

### Live Coding

Добавьте простую навигацию во view обоих module. Позже она переедет в layout —
сейчас полезно почувствовать дублирование.

---

## Слайд 5. Location Во View

### На Экране

```tsx
const location = useLocation();

location.pathname;
location.searchParams;
location.hashParams;
location.params;

location.matches('/orders', { end: true });
```

### Заметки Ведущего

`useLocation()` — framework snapshot текущего location. Не используйте
`window.location` для feature flow: это обходит router base URL, adapters и
testable contract.

---

## Слайд 6. Query Filter

### На Экране

```tsx
const location = useLocation();
const navigate = useNavigate();
const query = location.searchParams.get('query') ?? '';

await navigate.searchParams(
  { query: 'paid', page: 1 },
  { merge: true },
);
```

### Заметки Ведущего

Сначала покажите строковые параметры. DTO conversion с `searchToObject` можно
дать как расширение после того, как группа понимает базовый flow.

`merge: true` сохраняет остальные параметры. Спросите, должно ли изменение
фильтра создавать history entry или использовать replace — это продуктовый
выбор, а не догма framework.

---

## Слайд 7. View И Runtime Используют Разные API

### На Экране

```text
React view                 Runtime class
useLocation()              LocationServiceInterface
useNavigate()              NavigateServiceInterface
```

### Заметки Ведущего

Пока runtime service не используется в коде: DI будет на занятии 5. Сейчас
важно заранее сформировать правило — hooks принадлежат React view, injected
services принадлежат controller/provider/service.

---

## Слайд 8. Navigation Не Равна Обновлению Данных

### На Экране

```text
navigation -> меняет URL state
revalidate -> обновляет active loader data
```

### Заметки Ведущего

Покажите различие, но не API revalidate. Hash-only navigation не обязана
перезапускать route loader. Полный механизм будет введён после controller,
widget и frame, чтобы слушатель увидел разные runtime boundaries.

---

## Слайд 9. Практика

1. Добавить `/welcome` и `/orders`.
2. Настроить redirect `/` → `/welcome`.
3. Сделать navigation с active/pending состоянием.
4. Сохранить `query` и `page` в search params.
5. После refresh восстановить тот же UI state из URL.

### Контрольные Вопросы

- Чем branch route отличается от leaf route?
- Кто загружает module?
- Почему feature view не импортирует React Router?
- Когда search state полезнее локального `useState`?

### Мост К Следующей Теме

Навигация теперь дублируется в обоих экранах, а `OrdersModule` всё ещё выглядит
как decorator вокруг одного component. Сначала разберём ответственность module,
затем вынесем общую оболочку в layout.

## Источники Ведущего

- [Router и навигация](../03-router-and-navigation.md)
- [Ментальная модель](../01-mental-model.md)

