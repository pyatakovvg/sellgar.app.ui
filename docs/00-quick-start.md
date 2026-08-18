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
import type { OrdersLoaderData } from '../../dto';

export abstract class OrdersControllerInterface {
  abstract loader(): Promise<OrdersLoaderData>;
}
```

```ts
import type { ControllerArgs, WithPayload } from '@tiyn/app';

import type { UpdateOrderFilterPayload } from '../../dto';

export abstract class UpdateOrderFilterControllerInterface {
  abstract action(args: ControllerArgs<WithPayload<UpdateOrderFilterPayload>>): Promise<void>;
}
```

## 2. Controller Implementations

```ts
import { Controller, Inject } from '@tiyn/app';

import { OrdersServiceInterface } from '@domain/orders';

import { OrdersControllerInterface } from './orders-controller.interface';
import type { OrdersLoaderData } from '../../dto';

@Controller()
export class OrdersController implements OrdersControllerInterface {
  constructor(
    @Inject(OrdersServiceInterface)
    private readonly ordersService: OrdersServiceInterface,
  ) {}

  async loader(): Promise<OrdersLoaderData> {
    return {
      items: await this.ordersService.getOrders(),
    };
  }
}
```

```ts
import { Controller, Inject, NavigateServiceInterface, type ControllerArgs, type WithPayload } from '@tiyn/app';

import { UpdateOrderFilterControllerInterface } from './update-order-filter-controller.interface';
import type { UpdateOrderFilterPayload } from '../../dto';

@Controller()
export class UpdateOrderFilterController implements UpdateOrderFilterControllerInterface {
  constructor(
    @Inject(NavigateServiceInterface)
    private readonly navigateService: NavigateServiceInterface,
  ) {}

  async action(args: ControllerArgs<WithPayload<UpdateOrderFilterPayload>>): Promise<void> {
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
import { BindingModuleInterface, type BindingRegistryInterface } from '@tiyn/app';

import {
  OrdersController,
  OrdersControllerInterface,
  UpdateOrderFilterController,
  UpdateOrderFilterControllerInterface,
} from './controller';

export class OrdersBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(OrdersControllerInterface).to(OrdersController).inTransientScope();
    registry.bind(UpdateOrderFilterControllerInterface).to(UpdateOrderFilterController).inTransientScope();
  }
}
```

## 5. Module Declaration

```tsx
import { Module, UseBindings } from '@tiyn/app';

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

import { useLoaderData, useNavigate, useSubmit, WidgetHost } from '@tiyn/app';

import { OrdersSummaryWidget } from '@widget/orders-summary';

import { OrdersControllerInterface, UpdateOrderFilterControllerInterface } from '../classes/controller';

export const OrdersView: React.FC = () => {
  const data = useLoaderData(OrdersControllerInterface);
  const updateFilter = useSubmit(UpdateOrderFilterControllerInterface);
  const navigate = useNavigate();

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
            <button type="button" onClick={() => navigate.frame.open(`/orders/${order.id}`)}>
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
import { UseBindings, Widget, WidgetDefinition } from '@tiyn/app';

import { OrdersSummaryWidgetBindings } from './classes/classes.bindings.ts';
import { OrdersSummaryWidgetView } from './view';

export interface OrdersSummaryWidgetProps {
  readonly title: string;
}

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
import { Controller, Inject, type ControllerArgs, type WithProps } from '@tiyn/app';

import { OrdersServiceInterface } from '@domain/orders';

import { OrdersSummaryWidgetControllerInterface } from './orders-summary-widget-controller.interface';
import type { OrdersSummaryWidgetProps } from '../../../orders-summary.widget.tsx';
import type { OrdersSummaryWidgetData } from './domain/orders-summary-widget-data.ts';

@Controller()
export class OrdersSummaryWidgetController implements OrdersSummaryWidgetControllerInterface {
  constructor(
    @Inject(OrdersServiceInterface)
    private readonly ordersService: OrdersServiceInterface,
  ) {}

  async loader(args: ControllerArgs<WithProps<OrdersSummaryWidgetProps>>): Promise<OrdersSummaryWidgetData> {
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

import { useLoaderData, useWidgetProps } from '@tiyn/app';

import { OrdersSummaryWidgetControllerInterface } from '../classes/controller/orders-summary/orders-summary-widget-controller.interface.ts';
import type { OrdersSummaryWidgetProps } from '../orders-summary.widget.tsx';

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
  WidgetPreloaderInterface,
  type RuntimeProviderContextInterface,
  type RuntimeProviderResult,
} from '@tiyn/app';

import { OrdersSummaryWidget } from '../../orders-summary.widget.tsx';

@Provider()
export class OrdersSummaryWidgetPreloadProvider implements RuntimeProviderInterface {
  constructor(
    @Inject(WidgetPreloaderInterface)
    private readonly widgetPreloader: WidgetPreloaderInterface,
  ) {}

  beforeRender(context: RuntimeProviderContextInterface): Promise<RuntimeProviderResult> {
    return this.widgetPreloader.preload(context, OrdersSummaryWidget, {
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
interface OrderDetailsFrameParams {
  readonly id: string;
}
```

```tsx
import { Frame, UseBindings } from '@tiyn/app';

import { OrderDetailsBindings } from './classes/classes.bindings.ts';
import { OrderDetailsControllerInterface } from './classes/controller/order-details';
import { FrameView } from './view';

@UseBindings(OrderDetailsBindings)
@Frame({
  fallback: <p>Фрейм загружается...</p>,
  view: FrameView,
})
export class OrderDetailsFrame {}
```

## 12. Frame Controller

```ts
import type { ControllerArgs, WithParams, WithPayload } from '@tiyn/app';

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

export abstract class OrderDetailsControllerInterface {
  abstract loader(args: ControllerArgs<WithParams<OrderDetailsFrameParams>>): Promise<OrderDetailsFrameData>;

  abstract action(
    args: ControllerArgs<WithPayload<ConfirmOrderPayload, WithParams<OrderDetailsFrameParams>>>,
  ): Promise<ConfirmOrderResult>;
}
```

```ts
import { Controller, type ControllerArgs, type WithParams, type WithPayload } from '@tiyn/app';

@Controller()
export class OrderDetailsController implements OrderDetailsControllerInterface {
  async loader(args: ControllerArgs<WithParams<OrderDetailsFrameParams>>): Promise<OrderDetailsFrameData> {
    return {
      loadedAt: new Date().toISOString(),
      status: `Order ${args.params.id} loaded`,
    };
  }

  async action(
    args: ControllerArgs<WithPayload<ConfirmOrderPayload, WithParams<OrderDetailsFrameParams>>>,
  ): Promise<ConfirmOrderResult> {
    await confirmOrder(args.params.id, args.payload.reason);

    return {
      accepted: true,
    };
  }
}
```

```ts
export class OrderDetailsBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(OrderDetailsControllerInterface).to(OrderDetailsController).inSingletonScope();
  }
}
```

## 13. Frame View

```tsx
import { useLoaderData, useSubmit } from '@tiyn/app';

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

import { FrameShell, FrameShellInterface, type FrameShellContextInterface } from '@tiyn/app';

@FrameShell()
export class OrderDetailsFrameShell implements FrameShellInterface {
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
  frames: [
    new FrameRouter({
      baseSource: 'orders/:id',
      routes: [new FrameRoute({ load: () => import('@frame/order-details') })],
    }),
  ],
  layouts: [MainLayout],
  routes: [
    new Route({
      path: '/orders',
      load: () => import('@module/orders'),
    }),
  ],
});
```

FrameRouter объявлен на parent route, поэтому он доступен на `/orders`.
Приложение также настраивает общий shell через
`app.frames({ shell: OrderDetailsFrameShell })`.

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
- Frame class является пустым declaration с `@Frame`, без generic и базового класса.
- Frame добавлен в route `frames`.
- Frame controller data читается через `useLoaderData(token)`.
- Frame action запускается через `useSubmit(token)`.
- Feature code импортирует framework API только из `@tiyn/app`.
