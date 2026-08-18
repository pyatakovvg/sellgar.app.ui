# Структура Файлов И Public API

Документ задаёт общие границы feature packages поверх `@tiyn/app`. Точные
деревья описаны отдельно:

- [Module package](./13-module-package-structure.md);
- [Widget package](./12-widget-package-structure.md);
- [Frame package](./15-frame-package-structure.md);
- [Layout package](./14-layout-package-structure.md);
- [Application host](./16-application-host-structure.md).

## Package Boundary

- `src/index.ts` — единственная public-граница package.
- Внешние потребители импортируют package root, а не private source files.
- Package root экспортирует declaration token и только доказанные внешние
  contracts.
- Concrete implementations, bindings, private view blocks, owned DTO/Input,
  stores и helpers наружу не экспортируются.
- Отсутствующий внешний consumer означает, что export не нужен.

## Declaration И Implementation

Module, Widget, Frame и Layout declarations отделены от implementations и
содержат только framework metadata.

```text
src/
  index.ts
  orders.module.tsx
  classes/
  providers/
  view/
  components/
```

`WidgetDefinition<TProps>` наследуется ради phantom generic в class token.
Frame объявляется обычным пустым class с `@Frame`, потому что route params
принадлежат runtime. Abstract classes, используемые только как DI tokens,
concrete implementations реализуют через `implements` без `super()`.

## Application Host Package

Application host является composition root. Его точная структура описана в
[Application host](./16-application-host-structure.md); feature packages не
импортируют private host files.

## Layout Package

Layout является composition shell. Его точная структура описана в
[Layout package](./14-layout-package-structure.md); business controllers и
loader/action state layout-у не принадлежат.

## Module Package

Целевая структура route-level screen описана в
[Module package](./13-module-package-structure.md).

## Widget Package

Целевая структура reusable runtime block описана в
[Widget package](./12-widget-package-structure.md).

## Frame Package

Целевая структура overlay flow описана в
[Frame package](./15-frame-package-structure.md).

## Private Classes

`src/classes/` организуется по роли, затем по владельцу:

```text
classes/
  classes.bindings.ts
  controller/
    orders/
      orders-controller.interface.ts
      orders.controller.ts
      __test__/
      domain/
      dto/
      input/
      mapper/
      serializer/
  service/
    availability/
      availability-service.interface.ts
      availability.service.ts
  store/
    filter/
      filter-store.interface.ts
      filter.store.ts
```

- Внутри `classes/` нет `index.ts` ни на уровне роли, ни у владельца, ни в
  owned-каталогах.
- Каждый controller/service/store имеет owner-каталог.
- Owned Entity находится в `domain/`, DTO — в `dto/`, Input — в `input/`.
- Общие `classes/dto`, `classes/entity`, `classes/types` и плоские role-файлы
  запрещены.
- Internal imports указывают конкретный файл.

## Controller Contracts

Прикладной `*ControllerInterface` — abstract class для runtime identity и DI,
но не базовая implementation. Он не наследует framework controller interface.
Concrete controller использует `implements` и явно повторяет сигнатуры.

Loader/action получают единый `ControllerArgs`. Нужные поля компонуются через
`WithParams`, `WithProps` и `WithPayload`. `Request` и React Router objects в
контракт не входят. Метод без фактически читаемого runtime context объявляется
без аргумента.

Controller-owned payload не выводится через
`Parameters<ServiceInterface['method']>` и не раскрывает приватный domain
Input. При различии владельцев используется явный mapper.

## Bindings

Все registrations framework package находятся в одном
`src/classes/classes.bindings.ts`:

```ts
export class OrdersBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(OrdersControllerInterface).to(OrdersController);
  }
}
```

Если registrations нет, binding module и `@UseBindings` не создаются.

## Token Naming

DI/runtime token называется `*Interface`, concrete implementation — без
`Interface`; declarations называются `*Module`, `*Widget`, `*Frame` или
`*Layout`. Суффикс `Token` к class declaration не добавляется.

## Binding Rules

Binding связывает abstract token с concrete implementation. Self-binding
добавляется только когда implementation действительно резолвится по concrete
class.

## Providers

Каждый provider имеет owner-каталог:

```text
providers/orders-preload/
  index.ts
  orders-preload.provider.ts
```

Provider реализует runtime lifecycle, preload или subscription. Предметный
loader/action use case принадлежит controller или service.

## Presentation Indexes

Локальные `index.ts` допустимы у presentation/runtime owners, образующих
компонентный контракт: `view/header`, `components/fallback`, `shell`,
`providers/orders-preload`. Они не превращаются в package public API.

В `classes/` barrels запрещены независимо от глубины.

## Index File Rules

Package `src/index.ts` публикует только внешний API. Presentation/runtime owner
indexes остаются локальными. В `classes/` index files запрещены.

## Public API Примеры

```ts
export { OrdersModule } from './orders.module.tsx';
```

```ts
export { OrdersSummaryWidget } from './orders-summary.widget.tsx';
```

```ts
export { OrderReviewFrame } from './order-review.frame.tsx';
```

Controller token, event или provider экспортируется дополнительно только если
другой package действительно использует его как внешний framework contract.

## Review Checklist

- Public imports проходят через `src/index.ts`.
- `classes/` не содержит barrels и общих DTO/Entity.
- У каждой injectable abstraction есть abstract token, concrete implementation
  через `implements` и binding.
- View использует framework hooks, а не DI/domain service напрямую.
- Provider не содержит business mutation.
- Controller args transport-neutral и не содержат лишних полей.
- Widget/Frame declarations сохраняют generic через соответствующий
  `*Definition<T>`.
