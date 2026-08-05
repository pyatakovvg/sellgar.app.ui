# Быстрый Старт

Этот раздел показывает полный вертикальный сценарий: route module с loader,
action, view, bindings, widget preload и frame. Его можно читать как шаблон
для нового экрана.

Пример использует нейтральную область `orders`.

## Что Получится

После выполнения сценария появятся:

- route `/orders`;
- module `OrdersModule`;
- controller loader для списка orders;
- action controller для фильтра;
- view, который читает loader data и отправляет action;
- widget `OrdersSummaryWidget`;
- provider, который preload-ит widget до render;
- frame `OrderDetailsFrame`, открываемый из view.

## Минимальная Структура

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

widgets/orders-summary/
  src/
    index.ts
    orders-summary.widget.tsx
    classes/
      index.ts
      classes.bindings.ts
      controller/
        index.ts
        orders-summary-widget-controller.interface.ts
        orders-summary-widget.controller.ts
      dto/
        index.ts
        widget-props.dto.ts
        widget-loader.dto.ts
    providers/
      index.ts
      preload/
        index.ts
        orders-summary-preload.provider.ts
    view/
      index.ts
      widget.view.tsx

frames/order-details/
  src/
    index.ts
    order-details.frame.tsx
    classes/
      classes.bindings.ts
      params/
        index.ts
        frame.params.ts
    shell/
      index.ts
      frame.shell.tsx
    view/
      index.ts
      frame.view.tsx
```

Это минимальная структура примера. Подробные правила для packages описаны в
[Структура module package](./13-module-package-structure.md) и
[Структура widget package](./12-widget-package-structure.md), а для frame -
[Структура frame package](./15-frame-package-structure.md).

## 1. Controller Tokens

Публичным token для controller должен быть abstract class. View и metadata
работают с token, а DI binding связывает token с implementation.

```ts
import { ControllerInterface } from '@sellgar/app';

import type { OrdersLoaderData } from '../../dto';

export abstract class OrdersControllerInterface implements ControllerInterface {
  abstract loader(): Promise<OrdersLoaderData>;
}
```

```ts
import { ControllerInterface, type ControllerActionArgs } from '@sellgar/app';

import type { UpdateOrderFilterPayload } from '../../dto';

export abstract class UpdateOrderFilterControllerInterface implements ControllerInterface {
  abstract action(args: ControllerActionArgs<UpdateOrderFilterPayload>): Promise<void>;
}
```

## 2. Controller Implementations

```ts
import { Controller, Inject, type ControllerLoaderArgs } from '@sellgar/app';

import { OrdersServiceInterface } from '@domain/orders';

import { OrdersControllerInterface } from './orders-controller.interface';
import type { OrdersLoaderData } from '../../dto';

@Controller()
export class OrdersController extends OrdersControllerInterface {
  constructor(
    @Inject(OrdersServiceInterface)
    private readonly ordersService: OrdersServiceInterface,
  ) {
    super();
  }

  async loader(args: ControllerLoaderArgs): Promise<OrdersLoaderData> {
    return {
      items: await this.ordersService.getOrders({
        signal: args.request.signal,
      }),
    };
  }
}
```

```ts
import { Controller, Inject, NavigateServiceInterface, type ControllerActionArgs } from '@sellgar/app';

import { UpdateOrderFilterControllerInterface } from './update-order-filter-controller.interface';
import type { UpdateOrderFilterPayload } from '../../dto';

@Controller()
export class UpdateOrderFilterController extends UpdateOrderFilterControllerInterface {
  constructor(
    @Inject(NavigateServiceInterface)
    private readonly navigateService: NavigateServiceInterface,
  ) {
    super();
  }

  async action(args: ControllerActionArgs<UpdateOrderFilterPayload>): Promise<void> {
    await this.navigateService.searchParams(
      {
        query: args.payload.query,
      },
      {
        merge: true,
      },
    );
  }
}
```

## 3. DTO И Entity

```ts
export interface OrderEntity {
  readonly id: string;
  readonly number: string;
}

export interface OrdersLoaderData {
  readonly items: readonly OrderEntity[];
}

export interface UpdateOrderFilterPayload {
  readonly query: string;
}
```

## 4. Bindings

```ts
import { BindingModuleInterface, type BindingRegistryInterface } from '@sellgar/app';

import {
  OrdersController,
  OrdersControllerInterface,
  UpdateOrderFilterController,
  UpdateOrderFilterControllerInterface,
} from './controller';

export class OrdersBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(OrdersControllerInterface).to(OrdersController).inTransientScope();
    registry.bind(UpdateOrderFilterControllerInterface).to(UpdateOrderFilterController).inTransientScope();
  }
}
```

## 5. Module Declaration

```tsx
import { Module, UseBindings } from '@sellgar/app';

import { OrdersSummaryWidgetPreloadProvider } from '@widget/orders-summary';

import { OrdersBindings } from './classes';
import { OrdersControllerInterface, UpdateOrderFilterControllerInterface } from './classes/controller';
import { OrdersView } from './view';

@UseBindings(OrdersBindings)
@Module({
  providers: [OrdersSummaryWidgetPreloadProvider],
  view: OrdersView,
})
export class OrdersModule {}
```

В metadata указываются controller tokens, а не concrete classes.

## 6. Module View

```tsx
import React from 'react';

import { useFrame, useLoaderData, useSubmit, WidgetHost } from '@sellgar/app';

import { OrderDetailsFrame } from '@frame/order-details';
import { OrdersSummaryWidget } from '@widget/orders-summary';

import { OrdersControllerInterface, UpdateOrderFilterControllerInterface } from '../classes/controller';

export const OrdersView: React.FC = () => {
  const data = useLoaderData(OrdersControllerInterface);
  const updateFilter = useSubmit(UpdateOrderFilterControllerInterface);
  const orderDetailsFrame = useFrame(OrderDetailsFrame);

  return (
    <main>
      <WidgetHost
        token={OrdersSummaryWidget}
        props={{
          title: 'Заказы',
        }}
      />

      <button disabled={updateFilter.inProcess} type="button" onClick={() => updateFilter({ query: 'paid' })}>
        Применить фильтр
      </button>

      <ul>
        {data.items.map((order) => (
          <li key={order.id}>
            <button type="button" onClick={() => orderDetailsFrame.open({ id: order.id })}>
              {order.number}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
};
```

View не резолвит controllers через DI. Loader data читается через
`useLoaderData(token)`, action отправляется через `useSubmit(token)`.

## 7. Widget Declaration

```tsx
import { UseBindings, Widget, WidgetDefinition } from '@sellgar/app';

import { OrdersSummaryWidgetBindings } from './classes';
import { OrdersSummaryWidgetControllerInterface } from './classes/controller';
import { OrdersSummaryWidgetView } from './view';
import type { OrdersSummaryWidgetProps } from './classes/dto';

@UseBindings(OrdersSummaryWidgetBindings)
@Widget<OrdersSummaryWidgetProps>({
  fallback: <p>Виджет загружается...</p>,
  view: OrdersSummaryWidgetView,
})
export class OrdersSummaryWidget extends WidgetDefinition<OrdersSummaryWidgetProps> {}
```

```ts
export interface OrdersSummaryWidgetProps {
  readonly title: string;
}

export interface OrdersSummaryWidgetData {
  readonly count: number;
}
```

## 8. Widget Controller

```ts
import { Controller, Inject, WidgetControllerInterface, type WidgetControllerLoaderArgs } from '@sellgar/app';

import { OrdersServiceInterface } from '@domain/orders';

import { OrdersSummaryWidgetControllerInterface } from './orders-summary-widget-controller.interface';
import type { OrdersSummaryWidgetData, OrdersSummaryWidgetProps } from '../dto';

@Controller()
export class OrdersSummaryWidgetController extends OrdersSummaryWidgetControllerInterface {
  constructor(
    @Inject(OrdersServiceInterface)
    private readonly ordersService: OrdersServiceInterface,
  ) {
    super();
  }

  async loader(args: WidgetControllerLoaderArgs<OrdersSummaryWidgetProps>): Promise<OrdersSummaryWidgetData> {
    return {
      count: await this.ordersService.count({
        signal: args.signal,
      }),
    };
  }
}
```

## 9. Widget View

```tsx
import React from 'react';

import { useLoaderData, useWidgetProps } from '@sellgar/app';

import { OrdersSummaryWidgetControllerInterface } from '../classes/controller';
import type { OrdersSummaryWidgetProps } from '../classes/dto';

export const OrdersSummaryWidgetView: React.FC = () => {
  const props = useWidgetProps<OrdersSummaryWidgetProps>();
  const data = useLoaderData(OrdersSummaryWidgetControllerInterface);

  return (
    <section>
      <h2>{props.title}</h2>
      <span>{data.count}</span>
    </section>
  );
};
```

## 10. Widget Preload Provider

```ts
import {
  Inject,
  Provider,
  RuntimeProviderInterface,
  WidgetRuntimeFactoryInterface,
  type RuntimeProviderContextInterface,
  type RuntimeProviderResult,
} from '@sellgar/app';

import { OrdersSummaryWidget } from '../../orders-summary.widget.tsx';

@Provider()
export class OrdersSummaryWidgetPreloadProvider extends RuntimeProviderInterface {
  constructor(
    @Inject(WidgetRuntimeFactoryInterface)
    private readonly widgetRuntimeFactory: WidgetRuntimeFactoryInterface,
  ) {
    super();
  }

  beforeRender(context: RuntimeProviderContextInterface): Promise<RuntimeProviderResult> {
    return this.widgetRuntimeFactory.preload(context, OrdersSummaryWidget, {
      props: {
        title: 'Заказы',
      },
    });
  }
}
```

Provider передает widget props отдельно. `ownerScope` и `signal` берутся из
`context` внутри `preload(...)`.

## 11. Frame

```ts
import { Expose } from 'class-transformer';

export class OrderDetailsFrameParams {
  @Expose()
  readonly id!: string;
}
```

```tsx
import { Frame, FrameDefinition, HashFrameSource, UseBindings } from '@sellgar/app';

import { OrderDetailsBindings } from './classes/classes.bindings.ts';
import { OrderDetailsControllerInterface } from './classes/controller/order-details';
import { OrderDetailsFrameParams } from './classes/params';
import { OrderDetailsFrameShell } from './shell';
import { FrameView } from './view';

@UseBindings(OrderDetailsBindings)
@Frame<OrderDetailsFrameParams>({
  source: HashFrameSource.create('order-details', OrderDetailsFrameParams),
  shell: OrderDetailsFrameShell,
  fallback: <p>Фрейм загружается...</p>,
  view: FrameView,
})
export class OrderDetailsFrame extends FrameDefinition<OrderDetailsFrameParams> {}
```

## 12. Frame Controller

```ts
import { FrameControllerInterface, type FrameControllerActionArgs, type FrameControllerLoaderArgs } from '@sellgar/app';

import type { OrderDetailsFrameParams } from '../params';

export interface OrderDetailsFrameData {
  readonly loadedAt: string;
  readonly status: string;
}

export interface ConfirmOrderPayload {
  readonly reason: string;
}

export interface ConfirmOrderResult {
  readonly accepted: boolean;
}

export abstract class OrderDetailsControllerInterface extends FrameControllerInterface<OrderDetailsFrameParams> {
  abstract loader(args: FrameControllerLoaderArgs<OrderDetailsFrameParams>): Promise<OrderDetailsFrameData>;

  abstract action(
    args: FrameControllerActionArgs<OrderDetailsFrameParams, ConfirmOrderPayload>,
  ): Promise<ConfirmOrderResult>;
}
```

```ts
import { Controller } from '@sellgar/app';

@Controller()
export class OrderDetailsController extends OrderDetailsControllerInterface {
  async loader(args: FrameControllerLoaderArgs<OrderDetailsFrameParams>): Promise<OrderDetailsFrameData> {
    return {
      loadedAt: new Date().toISOString(),
      status: `Order ${args.props.id} loaded`,
    };
  }

  async action(
    args: FrameControllerActionArgs<OrderDetailsFrameParams, ConfirmOrderPayload>,
  ): Promise<ConfirmOrderResult> {
    await confirmOrder(args.props.id, args.payload.reason);

    return {
      accepted: true,
    };
  }
}
```

```ts
export class OrderDetailsBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(OrderDetailsControllerInterface).to(OrderDetailsController).inSingletonScope();
  }
}
```

## 13. Frame View

```tsx
import { useLoaderData, useSubmit } from '@sellgar/app';

import { OrderDetailsControllerInterface } from '../classes/controller/order-details';

export const FrameView: React.FC = () => {
  const data = useLoaderData(OrderDetailsControllerInterface);
  const submit = useSubmit(OrderDetailsControllerInterface);

  return (
    <section>
      <p>{data.status}</p>
      <button disabled={submit.inProcess} type="button" onClick={() => submit({ reason: 'manual' })}>
        Подтвердить
      </button>
    </section>
  );
};
```

## 14. Frame Shell

```tsx
import React from 'react';

import { FrameShellInterface, Injectable, type FrameShellContextInterface } from '@sellgar/app';

@Injectable()
export class OrderDetailsFrameShell extends FrameShellInterface {
  render(context: FrameShellContextInterface): React.ReactNode {
    return (
      <aside>
        <button type="button" onClick={() => context.close()}>
          Закрыть
        </button>
        {context.content}
      </aside>
    );
  }
}
```

## 15. Route Registration

```ts
new Route({
  path: '/',
  frames: [OrderDetailsFrame],
  layouts: [MainLayout],
  routes: [
    new Route({
      path: '/orders',
      load: () => import('@module/orders'),
    }),
  ],
});
```

Frame объявлен на parent route, поэтому он доступен на `/orders`.

## Проверочный Чеклист

- Module class экспортируется из module package.
- Controller tokens указаны в `@Module.controllers`.
- Controller tokens bound в `OrdersBindings`.
- View читает loader data через `useLoaderData(OrdersControllerInterface)`.
- View отправляет action через `useSubmit(UpdateOrderFilterControllerInterface)`.
- Widget class наследует `WidgetDefinition<TProps>`.
- WidgetHost получает `token` и typed `props`.
- Widget preload provider подключен в `@Module.providers`, `@Frame.providers`
  или `@Layout.providers`, если widget принадлежит layout shell.
- Frame class наследует `FrameDefinition<TProps>`.
- Frame добавлен в route `frames`.
- Frame controller data читается через `useLoaderData(token)`.
- Frame action запускается через `useSubmit(token)`.
- Feature code импортирует framework API только из `@sellgar/app`.
