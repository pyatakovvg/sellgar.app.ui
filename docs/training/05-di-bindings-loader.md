# Занятие 5. DI, Bindings И Controller Loader

- Статус документа: current
- Формат: 75 минут
- Уже известно: module владеет route screen
- Новые понятия: class token, binding module, `@UseBindings`, injection,
  controller, loader, `useLoaderData`

## Результат Занятия

Orders module получает данные через controller loader. Concrete service
создаётся framework DI, view не знает transport и не использует ручной `new`.

---

## Слайд 1. Проблема Hardcoded Data

### На Экране

```tsx
const orders = [/* demo data */];
```

```text
View не должна знать:
- откуда пришли данные
- как создать gateway/service
- как отменить request
```

### Заметки Ведущего

Вводите DI не как абстрактную архитектуру, а как способ соединить runtime-класс
с зависимостью и сохранить testable boundary.

---

## Слайд 2. Abstract Class — Тип И Token

### На Экране

```ts
export abstract class OrdersServiceInterface {
  abstract getOrders(options: {
    signal?: AbortSignal;
  }): Promise<readonly OrderEntity[]>;
}
```

### Заметки Ведущего

Abstract class существует в runtime и одновременно задаёт TypeScript contract.
Обычный interface стирается после compilation и сам по себе не может быть DI
token.

---

## Слайд 3. Concrete Service

### На Экране

```ts
@Injectable()
export class DemoOrdersService
  extends OrdersServiceInterface {
  async getOrders(): Promise<readonly OrderEntity[]> {
    return demoOrders;
  }
}
```

### Заметки Ведущего

Начните с in-memory implementation. HTTP gateway можно подставить позднее без
изменения controller и view.

---

## Слайд 4. Controller — Data Boundary Экрана

### На Экране

```ts
export interface OrdersLoaderData {
  items: readonly OrderEntity[];
}

export abstract class OrdersControllerInterface
  implements ControllerInterface {
  abstract loader(
    args: ControllerLoaderArgs,
  ): Promise<OrdersLoaderData>;
}
```

### Заметки Ведущего

Controller не является React controller и не является long-lived store. Это
boundary loader/action для ближайшего runtime entity.

---

## Слайд 5. Injection В Concrete Controller

### На Экране

```ts
@Controller()
export class OrdersController
  extends OrdersControllerInterface {
  constructor(
    @Inject(OrdersServiceInterface)
    private readonly orders: OrdersServiceInterface,
  ) {
    super();
  }

  async loader(args: ControllerLoaderArgs) {
    return {
      items: await this.orders.getOrders({
        signal: args.request.signal,
      }),
    };
  }
}
```

### Заметки Ведущего

`args.request.signal` связывает request с lifecycle route/module. Controller не
создаёт service и не решает его lifetime.

---

## Слайд 6. Binding Соединяет Token И Implementation

### На Экране

```ts
export class OrdersBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(OrdersServiceInterface)
      .to(DemoOrdersService)
      .inSingletonScope();

    registry.bind(OrdersControllerInterface)
      .to(OrdersController);
  }
}
```

```tsx
@UseBindings(OrdersBindings)
@Module({ view: OrdersView })
export class OrdersModule {}
```

### Заметки Ведущего

`@UseBindings` только записывает metadata. `ModuleScope` активирует bindings при
создании module runtime и освобождает их вместе с ним. Feature code импортирует
DI facade из `@sellgar/app`, а не Inversify.

### Контрольная Точка

Кто создаёт `OrdersController`? Кто определяет его lifetime? Ожидаемый ответ:
framework runtime через bindings активного module scope.

---

## Слайд 7. View Читает Loader Result

### На Экране

```tsx
export const OrdersView: React.FC = () => {
  const data = useLoaderData(OrdersControllerInterface);

  return data.items.map((order) => (
    <div key={order.id}>{order.number}</div>
  ));
};
```

### Заметки Ведущего

View не получает controller через `useDependency`. Для loader result есть
специализированный hook. Проговорите полный поток:

```text
route loader -> ModuleRuntime -> controller.loader -> useLoaderData
```

### Live Coding

Замените hardcoded массив loader-ом. Добавьте задержку, чтобы увидеть route
fallback. Затем замените demo service тестовой реализацией через binding.

---

## Слайд 8. Scope Выбирается По Владельцу

### На Экране

```text
ApplicationScope
└── RouteScope
    └── ModuleScope
        ├── OrdersService
        └── OrdersController
```

### Заметки Ведущего

Не углубляйтесь во все scope classes. Достаточно показать: bindings module не
становятся глобальными автоматически. Уход с route освобождает module runtime и
его локальные ресурсы.

---

## Слайд 9. Практика

1. Создать abstract service token и demo implementation.
2. Создать controller token и concrete controller.
3. Зарегистрировать оба binding-а.
4. Подключить bindings к module.
5. Прочитать loader result через `useLoaderData`.
6. Передать request signal в service.

### Типичные Ошибки

- ручной `new DemoOrdersService()` в controller;
- импорт `inversify` в feature package;
- чтение loader result через DI;
- binding controller вне module/frame/widget local scope;
- один controller, который заранее содержит все будущие actions.

### Мост К Следующей Теме

Данные читаются, но фильтр всё ещё меняется прямо из view. Следующий шаг —
пользовательская команда, pending state и action boundary.

## Источники Ведущего

- [DI facade и scopes](../07-di-runtime-state-events.md)
- [Controller loader](../04-modules-controllers-providers.md)
- [Module package structure](../13-module-package-structure.md)

