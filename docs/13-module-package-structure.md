# Структура Module-Пакета

Документ фиксирует целевую структуру `modules/*`. Runtime-контракт module и
controller описан в [Module, Controller и Provider](./04-modules-controllers-providers.md).

## Инварианты

- Один package владеет одним route-level screen.
- Route загружает module через package root.
- `src/index.ts` — единственная public-граница package.
- `src/classes/` полностью приватен и не содержит `index.ts`.
- Controller, service и store имеют отдельные owner-каталоги.
- Owned DTO, Input, Entity, mapper и serializer лежат внутри владельца.
- View не вызывает domain service, HTTP или DI напрямую.
- Пустые и speculative-каталоги запрещены.

## Минимальный Module

```text
modules/orders/
  AGENTS.md
  package.json
  tsconfig.json
  src/
    index.ts
    orders.module.tsx
    view/
      index.ts
      module.view.tsx
```

Declaration содержит только framework metadata:

```tsx
@Module({ view: ModuleView })
export class OrdersModule {}
```

## Module С Controllers

```text
src/
  index.ts
  orders.module.tsx
  classes/
    classes.bindings.ts
    controller/
      orders/
        __test__/
          orders.controller.test.ts
        orders-controller.interface.ts
        orders.controller.ts
        domain/
          orders-result.entity.ts
        dto/
          orders-filter.dto.ts
        input/
          update-order.input.ts
        mapper/
          order.mapper.ts
      filter/
        filter-controller.interface.ts
        filter.controller.ts
        domain/
          filter-result.entity.ts
    service/
      availability/
        availability-service.interface.ts
        availability.service.ts
  view/
    index.ts
    module.view.tsx
    header/
      index.ts
      header.tsx
      default.module.scss
    list/
      index.ts
      list.tsx
      default.module.scss
```

Независимые загрузки, например список и filter options, получают отдельные
controllers. Общего controller всего module и общих `classes/dto` либо
`classes/entity` нет.

## Controller Contract

Прикладной token не наследует framework controller interface:

```ts
export abstract class OrdersControllerInterface {
  abstract loader(args: ControllerArgs<WithParams<OrderRouteParams>>): Promise<OrdersResultEntity>;

  abstract action(args: ControllerArgs<WithPayload<UpdateOrderInput, WithParams<OrderRouteParams>>>): Promise<void>;
}
```

Concrete controller явно повторяет сигнатуры и использует `implements`:

```ts
@Controller()
export class OrdersController implements OrdersControllerInterface {
  async loader(args: ControllerArgs<WithParams<OrderRouteParams>>): Promise<OrdersResultEntity> {
    // ...
  }
}
```

`ControllerArgs` всегда добавляет `signal`. Дополнительные поля набираются
`WithParams`, `WithProps` и `WithPayload`; отдельных module/loader/action args
нет. Если метод не читает runtime context, он объявляется без аргумента:

```ts
abstract loader(): Promise<ReferenceDataEntity>;
```

`Request` не входит в controller contract. React Router adapter преобразует
transport context до вызова runtime.

## Payload И Domain Input

Controller владеет своим payload/input. Приватный Input domain service не
экспортируется и не заменяется косвенным boundary-типом через
`Parameters<ServiceInterface['method']>`.

Если controller payload и domain input различаются по владельцу или смыслу,
controller mapper выполняет явное преобразование перед вызовом service.

## Bindings

Все registrations package находятся в одном `src/classes/classes.bindings.ts`:

```ts
export class OrdersBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(OrdersControllerInterface).to(OrdersController);
  }
}
```

Binding class не наследует `BindingModuleInterface` и не вызывает `super()`.
При отсутствии registrations файл и `@UseBindings` не создаются.

## Providers

Runtime provider размещается в owner-каталоге:

```text
src/providers/orders-preload/
  index.ts
  orders-preload.provider.ts
```

Provider отвечает за lifecycle/preload/subscription, но не заменяет controller
и не содержит предметный CRUD use case.

## Public API

Обычно package root экспортирует только module declaration:

```ts
export { OrdersModule } from './orders.module.tsx';
```

Concrete controllers, bindings, owned DTO/Input/Entity, stores, services и view
blocks не экспортируются. Controller token публикуется только при доказанном
межпакетном framework-контракте; обычный view того же package использует private
конкретный путь.

## Проверка

- В `classes/` нет barrels, общих DTO/Entity и плоских role-файлов.
- У каждого controller/service/store есть owner-каталог.
- Controller interfaces не наследуют framework controller interface.
- Concrete implementations и bindings используют `implements`.
- Аргументы controller не содержат `Request` и лишние поля.
- View работает через `useLoaderData`, `useSubmit` и `useController`.
- Запущены tests, typecheck и production build.
