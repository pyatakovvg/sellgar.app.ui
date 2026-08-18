# Структура Frame-Пакета

Документ фиксирует структуру `frames/*`. Runtime и routing contract описаны в
[Frames](./06-frames.md).

## Инварианты

- Один package владеет одним Frame runtime, а не всем navigation flow.
- Frame package не владеет source, shell и `FrameRouter` declaration.
- `src/index.ts` — единственная публичная граница package.
- `src/classes/` полностью приватен и не содержит barrels.
- Routing params принадлежат runtime и читаются controller-ом через `args.params`
  либо view через общий `useParams<TParams>()`.
- Controllers, services и stores имеют отдельные owner-каталоги.
- Owned DTO, Input, Entity, mapper и serializer лежат внутри владельца.
- Пустые и speculative-каталоги запрещены.

## Минимальный Frame

```text
frames/order-review/
  AGENTS.md
  package.json
  tsconfig.json
  src/
    index.ts
    order-review.frame.tsx
    view/
      frame.view.tsx
```

```tsx
@Frame({
  view: FrameView,
})
export class OrderReviewFrame {}
```

Frame declaration не типизирует параметры маршрута и не наследует базовый
класс. Приватный params type используют controller и view в точках чтения.

## Frame С Controller

```text
src/
  index.ts
  order-review.frame.tsx
  classes/
    classes.bindings.ts
    controller/
      order-review/
        __test__/
          order-review.controller.test.ts
        order-review-controller.interface.ts
        order-review.controller.ts
        domain/
          order-review-result.entity.ts
        input/
          order-action.input.ts
        mapper/
          order-action.mapper.ts
  layout/
    main/
      index.ts
      main.layout.tsx
      view/
        layout.view.tsx
  view/
    frame.view.tsx
    content/
      index.ts
      content.tsx
      default.module.scss
```

Не создавай `classes/params` только потому, что URL содержит динамический
сегмент. Простой props type можно держать рядом с declaration либо у controller,
который его использует. Runtime DTO нужен только при реальной валидации или
преобразовании.

## Controller Contract

```ts
type OrderReviewControllerArgs = ControllerArgs<WithProps<{ readonly orderId: string }>>;

export abstract class OrderReviewControllerInterface {
  abstract loader(args: OrderReviewControllerArgs): Promise<OrderReviewResultEntity>;

  abstract action(
    args: ControllerArgs<WithPayload<OrderActionInput, WithProps<{ readonly orderId: string }>>>,
  ): Promise<void>;
}
```

Concrete controller использует `implements`, явно повторяет сигнатуры и
получает framework/domain dependencies через DI. `Request`, hash и React Router
objects в controller args отсутствуют.

## Routing И Shell

Routing declaration находится у обычного `Route`, а не внутри Frame package:

```ts
new FrameRouter({
  baseSource: 'orders/:orderId',
  routes: [
    new FrameRoute({ load: () => import('@frame/order-review') }),
    new FrameRoute({ path: 'edit', load: () => import('@frame/order-edit') }),
  ],
});
```

Общий shell принадлежит application host и настраивается через
`app.frames({ shell })`. Специализированный shell всего flow может принадлежать
владельцу `FrameRouter` и задаётся в его options. Ни один из них не экспортирует
из Frame package внутренний controller или view.

## Bindings И Providers

Injectable registrations находятся в `src/classes/classes.bindings.ts`.
Binding class использует `implements BindingModuleInterface` без `super()`.

Frame-owned provider размещается отдельно:

```text
src/providers/order-events/
  index.ts
  order-events.provider.ts
```

Provider отвечает за lifecycle/preload/subscription; create/update/review use
case остаётся controller-у.

## Public API

Обычно package экспортирует только declaration:

```ts
export { OrderReviewFrame } from './order-review.frame.tsx';
```

Params, controllers, bindings, owned contracts, layouts и view blocks остаются
private. `FrameRoute.load()` получает declaration через lazy package facade.

## Проверка

- В `classes/` нет barrels и общих DTO/Entity.
- Declaration не содержит source, shell, policies и use case.
- Frame подключён через `FrameRoute`/`FrameRouter` на нужном обычном `Route`.
- Concrete controllers/services/stores/bindings используют `implements`.
- View не читает params из hash, React Router или location service.
- Controller args состоят только из нужных `props`, `payload`, `params` и
  `signal`.
- Запущены frame/runtime tests, typecheck и production build.
