# Структура Widget-Пакета

Документ фиксирует целевую структуру `widgets/*`. Runtime-контракт виджета
описан в [Widgets](./05-widgets.md), единые аргументы контроллеров — в
[Module, Controller и Provider](./04-modules-controllers-providers.md#контракт-controller).

## Инварианты

- Один package владеет одним reusable runtime UI block.
- `src/index.ts` — единственная public-граница package.
- `src/classes/` полностью приватен; deep imports из других packages запрещены.
- Внутри `classes/` нет `index.ts`: imports ведут в конкретные файлы.
- Каждая controller, service или store имеет собственный owner-каталог.
- DTO, Input, Entity, mapper и serializer лежат внутри каталога владельца.
- Каталоги создаются только при наличии файлов.
- Widget lifecycle реализуется `@Widget` и runtime providers. Отдельные
  `widget.provider.tsx` и `widget.context.ts` не заменяют widget runtime.

## Минимальный Widget

```text
widgets/orders-summary/
  AGENTS.md
  package.json
  tsconfig.json
  src/
    index.ts
    orders-summary.widget.tsx
    view/
      index.ts
      widget.view.tsx
```

Declaration остаётся пустым class token. `extends WidgetDefinition<TProps>` —
техническое исключение: наследуемый phantom generic сохраняет `TProps` для
`WidgetHost`.

```tsx
@Widget<OrdersSummaryWidgetProps>({
  view: WidgetView,
})
export class OrdersSummaryWidget extends WidgetDefinition<OrdersSummaryWidgetProps> {}
```

Для виджета без обязательных props `WidgetHost` не требует `props={{}}`:

```tsx
<WidgetHost token={ClockWidget} />
```

## Widget С Controller

```text
src/
  index.ts
  orders-summary.widget.tsx
  classes/
    classes.bindings.ts
    controller/
      orders-summary/
        orders-summary-controller.interface.ts
        orders-summary.controller.ts
        domain/
          orders-summary-result.entity.ts
        input/
          refresh-orders.input.ts
        mapper/
          orders-summary.mapper.ts
  view/
    index.ts
    widget.view.tsx
    summary/
      index.ts
      summary.tsx
      default.module.scss
```

Owned-каталоги `domain/`, `dto/`, `input/`, `mapper/`, `serializer/`,
`__test__/` добавляются только когда роль действительно существует. Общие
`classes/dto`, `classes/entity` и role-level barrels запрещены.

Controller token — абстрактный class для runtime identity и DI. Concrete class
использует `implements`, а не `extends`, и не вызывает `super()`.

```ts
export abstract class OrdersSummaryControllerInterface {
  abstract loader(args: ControllerArgs<WithProps<OrdersSummaryWidgetProps>>): Promise<OrdersSummaryResultEntity>;
}

@Controller()
export class OrdersSummaryController implements OrdersSummaryControllerInterface {
  async loader(args: ControllerArgs<WithProps<OrdersSummaryWidgetProps>>): Promise<OrdersSummaryResultEntity> {
    // ...
  }
}
```

Если controller не читает `props`, `params`, `payload` или `signal`, аргумент у
метода отсутствует. Widget не вводит собственные варианты loader/action args.

## Providers

Widget-owned runtime provider размещается по владельцу:

```text
src/providers/orders-preload/
  index.ts
  orders-preload.provider.ts
```

Provider подключается через metadata `providers` и реализует
`RuntimeProviderInterface` через `implements`. Предметный loader/action use case
остаётся в controller.

## Presentation

- `view/widget.view.tsx` компонует runtime view.
- Локальные presentation blocks живут в `view/<owner>/` и могут иметь локальный
  `index.ts`.
- Package-level `components/fallback` и `components/exception` создаются только
  для framework slots, используемых несколькими view-ветками.
- React-компоненты не вызывают domain services напрямую.

## Public API

Обычно package экспортирует только declaration:

```ts
export { OrdersSummaryWidget } from './orders-summary.widget.tsx';
```

Controller, bindings, owned payloads/results, view blocks и providers остаются
private. Экспорт дополнительного контракта допустим только при реальном внешнем
потребителе; внутренний `classes/` при этом не становится public import path.

## Проверка

- В `classes/` нет `index.ts` и deep imports извне.
- Declaration содержит только metadata и phantom `WidgetDefinition<TProps>`.
- Concrete controllers, services, stores и bindings используют `implements`.
- `WidgetHost` не получает пустой `props={{}}`.
- Loader/action используют единый `ControllerArgs` и только фактически читаемые
  композиционные наборы.
- Запущены тесты widget/runtime, typecheck и build приложения.
