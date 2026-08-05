# Занятие 4. Module: От View К Владельцу Экрана

- Статус документа: current
- Формат: 45–60 минут
- Уже известно: route tree загружает module package
- Новые понятия: module boundary, metadata, public export, module package

## Результат Занятия

Слушатель отличает module от React component, widget и frame на уровне
назначения и умеет оформить route screen как package с устойчивой публичной
границей.

---

## Слайд 1. Module Отвечает За Экран Leaf Route

### На Экране

```text
Route: когда загрузить
Module: что составляет runtime экрана
View: как экран выглядит
```

### Заметки Ведущего

Вернитесь к `WelcomeModule` и `OrdersModule`. У module есть lifecycle и scope,
даже если минимальный пример использовал только `view`.

---

## Слайд 2. Declaration Не Runtime

### На Экране

```tsx
@Module({ view: OrdersView })
export class OrdersModule {}
```

```text
decorator записал metadata
route import нашёл declaration
framework создал ModuleRuntime
runtime показал view
```

### Контрольная Точка

Попросите указать строку, в которой feature code создаёт `ModuleRuntime`.
Правильный ответ: такой строки нет, runtime принадлежит framework.

---

## Слайд 3. Metadata Растёт Вместе С Потребностью

### На Экране

```ts
interface ModuleMetadata {
  view: RenderableView;
  exception?: React.ReactNode;
  providers?: readonly ProviderToken[];
}
```

### Заметки Ведущего

Сегодня используйте `view` и локальный `exception`. Providers показываются на
слайде только как будущая точка расширения и подробно появятся на занятии 10.
Не заполняйте metadata «на будущее».

---

## Слайд 4. View Остаётся Композицией React

### На Экране

```tsx
export const OrdersView: React.FC = () => (
  <main>
    <OrdersHeading />
    <OrdersFilters />
    <OrdersTable />
  </main>
);
```

### Заметки Ведущего

Три внутренних компонента не становятся тремя modules. Module — граница
feature screen, а не способ дробления JSX.

---

## Слайд 5. Public Package Boundary

### На Экране

```text
modules/orders/
  package.json
  src/
    orders.module.tsx
    view/
    index.ts
```

```ts
// src/index.ts
export { OrdersModule } from './orders.module';
```

```ts
load: () => import('@module/orders')
```

### Заметки Ведущего

Route не должен знать private structure package. Public export сохраняет
свободу перемещать view, components и classes внутри module.

---

## Слайд 6. Ближайшая Exception Boundary

### На Экране

```tsx
@Module({
  exception: <OrdersExceptionView />,
  view: OrdersView,
})
export class OrdersModule {}
```

### Заметки Ведущего

Module exception UI локализует runtime failure экрана. Саму ошибку view сможет
получить через `useException()`; полный error flow будет на занятии 15. Сейчас
нужно понять иерархию boundary: module может переопределить route/application
exception presentation.

---

## Слайд 7. Выбор Сущности

### На Экране

| Сценарий | Выбор |
|---|---|
| Основной экран `/orders` | Module |
| Статическая карточка внутри экрана | React component |
| Переиспользуемый блок со своим loader | Widget — позже |
| Drawer поверх экрана | Frame — позже |

### Заметки Ведущего

Здесь widget и frame определяются через задачу, без API. Цель — научить выбору
владельца до изучения синтаксиса.

---

## Слайд 8. Практика

1. Оформить `OrdersModule` отдельным package.
2. Разделить view на heading, filters и table components.
3. Оставить наружу только `OrdersModule`.
4. Добавить локальный exception view.
5. Объяснить, почему `OrdersTable` пока не widget.

### Мост К Следующей Теме

Orders view всё ещё содержит захардкоженный массив. Следующая проблема —
получить данные из сервиса без ручного `new`, не смешав transport и JSX.

## Источники Ведущего

- [Modules, controllers и providers](../04-modules-controllers-providers.md)
- [Структура module package](../13-module-package-structure.md)
- [Public API boundary](../17-public-api-boundary.md)

