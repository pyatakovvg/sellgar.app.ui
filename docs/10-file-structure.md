# Структура Файлов И Public API

Этот раздел фиксирует практические правила организации feature packages для
`@tiyn/app`.

Цель структуры - быстро понимать, где declaration, где runtime implementation,
где bindings, где DTO/entities и что является публичным API package.

## Общие Правила

- В корне package должен быть `src/index.ts`.
- Потребители импортируют package через public index.
- Если у каталога есть `index.ts`, соседние файлы импортируют его как слой,
  а не ходят в deep path без необходимости.
- Declaration files должны быть отделены от implementation files.
- Binding modules должны находиться рядом с declaration, которую они
  обслуживают.
- Public token должен быть abstract class, если он используется в metadata или
  hooks.
- Любой `*-interface.ts`, который используется как DI token, должен
  экспортировать `abstract class`, а не TypeScript `interface`.
- Concrete implementation не должна становиться public token без причины.

## Application Host Package

Подробная целевая структура application host package описана в
[Структура application host](./16-application-host-structure.md).

Application host package отличается от feature packages: он является composition
root, а не reusable package. Его source entrypoints - `src/main.ts`,
`src/bootstrap.tsx` и `src/application`.

Feature packages не должны импортировать файлы из host package. Host package
подключает feature packages через их public package roots и не ходит в их
private source files.

## Framework Feature Package

`library/tiyn-app/src/features/*` содержит framework-level подсистемы, которые
подключаются к application runtime как цельные features: binding modules,
runtime state, public service contracts и React layer.

Feature package не должен быть UI-библиотекой и не должен зависеть от
конкретного host application. Визуальная часть подключается через presentation
adapter, который передается в feature configuration на уровне application host.

Короткая форма:

```text
library/tiyn-app/src/features/{feature-name}/
  index.ts
  binding/
    index.ts
    {feature-name}-bindings.ts
  contract/
    {feature-name}-service/
      index.ts
      {feature-name}-payload.ts
      {feature-name}-service.interface.ts
  declaration/
    {feature-name}-presentation/
      index.ts
      {feature-name}-presentation.ts
      {feature-name}-presentation-registry.ts
      {feature-name}-presentation-not-configured.exception.ts
  react/
    {feature-name}-layer/
      index.ts
      {feature-name}-layer.tsx
    {feature-name}-view-props/
      index.ts
      {feature-name}-view-props.ts
  runtime/
    {feature-name}-runtime/
      index.ts
      {feature-name}-request.ts
      {feature-name}-runtime.interface.ts
      {feature-name}-runtime.ts
      {feature-name}.service.ts
  {feature-name}-feature/
    index.ts
    {feature-name}-feature.tsx
```

### Что Экспортировать

Feature package экспортирует только минимальный public API: feature declaration,
presentation configuration API, public service token, public payload types,
view-props для presentation adapters и hooks потребителей, если они являются частью
контракта feature.

Concrete runtime classes и bindings экспортируются только внутри feature
package, если они не нужны потребителям напрямую.

Feature подключается через application configuration:

```ts
app.features([
  UserRequestFeature.configure({
    presentation: UserRequestPresentation.define((registry) => {
      registry.alert(AlertUserRequestView);
    }),
  }),
]);
```

Если вызванный request kind не имеет зарегистрированного presentation view,
feature должна падать явной configuration ошибкой, а не подменять результат на
cancel/default.

## Layout Package

Подробная целевая структура layout package описана в
[Структура layout package](./14-layout-package-structure.md).

Короткая форма для route/application shell:

```text
layouts/auth/
  src/
    index.ts
    auth.layout.tsx
    view/
      index.ts
      layout.view.tsx
      default.module.scss
      header/
        index.tsx
        header.tsx
        default.module.scss
```

### Что Экспортировать

`src/index.ts`:

```ts
export { AuthLayout } from './auth.layout.tsx';
```

Layout package экспортирует только layout declaration token. View blocks,
assets, hooks и local components остаются internal.

## Module Package

Подробная целевая структура module package описана в
[Структура module package](./13-module-package-structure.md).

Короткая форма для route module:

```text
modules/orders/
  src/
    index.ts
    orders.module.tsx
    classes/
      index.ts
      classes.bindings.ts
      controller/
        index.ts
        orders/
          index.ts
          orders-controller.interface.ts
          orders.controller.ts
        update-order-filter/
          index.ts
          update-order-filter-controller.interface.ts
          update-order-filter.controller.ts
      dto/
        index.ts
        orders-loader.dto.ts
        update-order-filter-payload.dto.ts
      entity/
        index.ts
        order.entity.ts
    view/
      index.ts
      module.view.tsx
```

### Что Экспортировать

`src/index.ts`:

```ts
export { OrdersModule } from './orders.module.tsx';
export type { OrdersLoaderData, UpdateOrderFilterPayload } from './classes/dto';
export type { OrderEntity } from './classes/entity';
```

Обычно module package экспортирует module declaration и точечные public
DTO/entities.

Controllers чаще остаются internal, если они нужны только внутри module package.
Если другой package должен таргетить controller token для revalidate/action,
экспортируй token осознанно:

```ts
export { OrdersControllerInterface } from './classes/controller';
```

### Controller Index

```ts
export { OrdersControllerInterface, OrdersController } from './orders';
export { UpdateOrderFilterControllerInterface, UpdateOrderFilterController } from './update-order-filter';
```

Если implementation не должна использоваться извне, не экспортируй
`classes/controller/index.ts` из package root.

## Widget Package

Подробная целевая структура widget package описана в
[Структура widget package](./12-widget-package-structure.md).

Короткая форма для runtime widget:

```text
widgets/orders-summary/
  src/
    index.ts
    orders-summary.widget.tsx
    classes/
      index.ts
      classes.bindings.ts
      controller/
        index.ts
        orders-summary-controller.interface.ts
        orders-summary.controller.ts
      dto/
        index.ts
        widget-props.dto.ts
        widget-loader.dto.ts
    view/
      index.ts
      widget.view.tsx
```

### Public API Widget Package

Widget package обычно экспортирует:

```ts
export { OrdersSummaryWidget } from './orders-summary.widget.tsx';
export type { OrdersSummaryWidgetData, OrdersSummaryWidgetProps } from './classes/dto';
```

`OrdersSummaryWidget` - public token для `WidgetHost`.

Если widget предоставляет reusable preload provider, provider живет в widget
package и экспортируется из package root. Module, frame или layout остается
владельцем execution point и подключает этот provider в своем `providers: [...]`.

Controller token экспортируй только если внешний код должен читать widget data,
submit-ить action или писать tests вокруг widget internals. В большинстве
случаев controller token остается internal для widget package.

## Frame Package

Подробная целевая структура frame package описана в
[Структура frame package](./15-frame-package-structure.md).

Короткая форма для hash-driven overlay flow:

```text
frames/order-details/
  src/
    index.ts
    order-details.frame.tsx
    classes/
      classes.bindings.ts
      controller/
        order-details/
          index.ts
          order-details-controller.interface.ts
          order-details.controller.ts
      params/
        index.ts
        frame.params.ts
      dto/
        index.ts
        confirm-order.dto.ts
      entity/
        index.ts
        order-details.entity.ts
    shell/
      index.ts
      frame.shell.tsx
    view/
      index.ts
      frame.view.tsx
      content/
        index.ts
        content.tsx
    components/
      fallback/
        index.ts
        fallback.tsx
      exception/
        index.ts
        exception.tsx
    constants/
      index.ts
      frame.constants.ts
```

### Public API Frame Package

```ts
export { OrderDetailsFrame } from './order-details.frame.tsx';
export { OrderUpdatedEvent } from './classes/events/order-updated.event.ts';
```

`OrderDetailsFrame` - public token для `useFrame(...)`, `FrameServiceInterface`
и route `frames`.

Frame controller interface обычно не экспортируется из public API package,
если он нужен только view внутри самого frame. Экспортируй его только когда
внешний код должен вызвать frame action через runtime API.

Params, shell, view, hash constants и bindings обычно internal.

## Token Naming

Для controller token:

```text
OrdersControllerInterface
UpdateOrderFilterControllerInterface
OrdersSummaryWidgetControllerInterface
```

Для implementation:

```text
OrdersController
UpdateOrderFilterController
OrdersSummaryWidgetController
```

Для declarations:

```text
OrdersModule
OrdersSummaryWidget
OrderDetailsFrame
```

Не добавляй `Token` suffix к class declaration, если сам class уже является
token.

## Binding Rules

Token -> implementation:

```ts
registry.bind(OrdersControllerInterface).to(OrdersController).inTransientScope();
```

Implementation self-binding нужен только если implementation реально
резолвится по concrete class:

```ts
registry.bind(OrdersController).toSelf().inTransientScope();
```

Для controller metadata и hooks используй token:

```tsx
@Module({
  view: OrdersView,
})
export class OrdersModule {}
```

```tsx
const data = useLoaderData(OrdersControllerInterface);
```

## View File Rules

View file должен содержать React rendering и hooks.

View не должен:

- создавать runtime scopes;
- вручную resolve-ить controller instances;
- читать loader data через `useDependency(...)`;
- выполнять DI binding;
- содержать provider lifecycle logic.

Допустимо:

- `useLoaderData(...)`;
- `useSubmit(...)`;
- `useLocation()`;
- `useNavigate()`;
- `useRevalidate()`;
- `useFrame(...)`;
- `WidgetHost`.

## Provider File Rules

Provider file должен описывать lifecycle contribution.

Хорошие имена:

```text
orders-summary-preload.provider.ts
orders-events.provider.ts
orders-telemetry.provider.ts
```

Provider не должен становиться универсальным service class. Если class содержит
business operation, это service или controller, а не provider.

## DTO И Entity File Rules

DTO и entity files живут внутри business/runtime слоя package: `classes/dto`,
`classes/entity` или рядом с controller, если нужны только ему.

DTO file хранит DTO-like interfaces, которые нужны нескольким файлам package:

```ts
export interface OrdersLoaderData {
  readonly items: readonly OrderEntity[];
}

export interface UpdateOrderFilterPayload {
  readonly query: string;
}
```

Не создавай общий `types` каталог для module/widget package. Framework
declarations `@Module`, `@Widget`, `@Frame` должны жить в отдельных declaration
files.

## Index File Rules

Index file - граница package.

Он должен экспортировать только то, что нужно потребителям:

- module/widget/frame declaration token;
- public provider, если он предназначен для подключения извне;
- public params/DTO/entity contracts;
- public controller token только если он нужен внешнему коду.

Он не должен экспортировать:

- private view components;
- concrete controller implementations без необходимости;
- internal helper functions;
- binding modules, если потребитель не должен подключать их напрямую.

## Checklist Для Review

- У package есть `src/index.ts`.
- Public imports идут через package index.
- Controller metadata использует abstract token.
- Binding связывает abstract token с implementation.
- View читает loader data через hook.
- Provider не содержит business mutation.
- Widget declaration наследует `WidgetDefinition<TProps>`.
- Frame declaration наследует `FrameDefinition<TProps>`.
- Shell/view фрейма не экспортируются наружу без необходимости.
- Public API package не раскрывает internal files.
