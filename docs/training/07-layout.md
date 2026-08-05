# Занятие 7. Layout: Общая Оболочка Route-Ветки

- Статус документа: current
- Формат: 45–60 минут
- Уже известно: несколько routes и modules
- Новые понятия: `@Layout`, route composition, nested outlet boundary

## Результат Занятия

Навигация вынесена из module views в `MainLayout`. При переходе между
`/welcome` и `/orders` оболочка остаётся общей, а меняется только child content.

---

## Слайд 1. Дублирование Показывает Нового Владельца

### На Экране

```text
WelcomeView: Navigation + content
OrdersView:  Navigation + content

Navigation принадлежит route-ветке,
а не одному module.
```

### Заметки Ведущего

Layout вводится после появления дублирования. Он не является «component для
красивой рамки», а задаёт composition shell и boundary для route subtree.

---

## Слайд 2. Минимальный Layout

### На Экране

```tsx
@Layout({ view: MainLayoutView })
export class MainLayout {}
```

```tsx
export const MainLayoutView: React.FC<LayoutViewProps> = ({ children }) => (
  <main>
    <Navigation />
    {children}
  </main>
);
```

### Заметки Ведущего

Declaration снова не равен runtime. Layout view получает `children` — active
content вложенной route-ветки.

---

## Слайд 3. Layout Подключается К Route

### На Экране

```ts
new Route({
  path: '/',
  layouts: [MainLayout],
  routes: [
    new Route({ path: '/welcome', load: () => import('@module/welcome') }),
    new Route({ path: '/orders', load: () => import('@module/orders') }),
  ],
});
```

### Заметки Ведущего

Route layouts наследуются child routes. Module ничего не знает о внешней
оболочке. Это позволяет один и тот же module помещать в согласованную route
composition.

---

## Слайд 4. Несколько Layouts Композируются

### На Экране

```text
layouts: [MainLayout, OrdersSectionLayout]

<MainLayout>
  <OrdersSectionLayout>
    <OrdersView />
  </OrdersSectionLayout>
</MainLayout>
```

### Заметки Ведущего

Порядок parent → child виден прямо в массиве. Не создавайте вложение вручную во
view module: иначе route tree перестаёт быть источником composition.

---

## Слайд 5. Pending И Exception Остаются В Ближайшей Boundary

### На Экране

```text
MainLayout остаётся mounted
└── child outlet показывает fallback/error
```

### Заметки Ведущего

При переходе между sibling routes общий parent layout не должен исчезать.
Fallback и exception отображаются в ближайшем меняющемся route outlet.

---

## Слайд 6. Layout Может Иметь Providers, Но Не Бизнес-Экран

### На Экране

```tsx
@Layout({
  providers: [NavigationWidgetPreloadProvider],
  view: MainLayoutView,
})
export class MainLayout {}
```

### Заметки Ведущего

Это preview занятия 10. Provider оправдан, если layout владеет runtime-процессом
для своего содержимого. Бизнес loader списка заказов остаётся controller-ом
Orders module.

---

## Слайд 7. Layout Не Владеет Frame Infrastructure

### На Экране

```text
Application.createView()
├── Router view + layouts
└── global FrameLayer
```

### Заметки Ведущего

Не помещайте frame host в layout. Framework устанавливает глобальный FrameLayer
сам. Это станет важно через два занятия.

---

## Слайд 8. Практика

1. Создать `MainLayout` package.
2. Перенести navigation из module views.
3. Подключить layout к общей route branch.
4. Добавить child layout только для `/orders`.
5. Проверить, что parent navigation не исчезает при переходе.

### Мост К Следующей Теме

В layout нужен summary заказов, который также понадобится во frame. Обычный
component пришлось бы снабжать данными каждому владельцу. Это мотивация для
widget с собственным runtime.

## Источники Ведущего

- [Layouts в router](../03-router-and-navigation.md#layouts)
- [Структура layout package](../14-layout-package-structure.md)

