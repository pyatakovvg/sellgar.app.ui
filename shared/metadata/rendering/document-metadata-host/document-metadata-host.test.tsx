import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Application } from '../../../../react/application/lifecycle/application';
import type { ApplicationConfiguratorInterface } from '../../../../react/application/config/application-configurator';
import { Module } from '../../../../react/module/declaration/module';
import { Route } from '../../../../react/router/declaration/route';
import { Router } from '../../../../react/router/declaration/router';
import { Shell, ShellInterface, type ShellContextInterface } from '../../../../react/router/declaration/shell';
import { createWebRouterBridge } from '../../../../react/router/bridge/web-router-bridge';
import { segments } from '../../../../core/router/declaration/address';
import { Metadata } from '../../../../core/metadata/declaration/metadata';
import { MetadataServiceInterface } from '../../../../core/metadata/service/metadata-service';
import { NavigateServiceInterface } from '../../../../core/router/service/navigate-service';
import { Controller } from '../../../../core/controller/contract/controller';
import { Inject } from '../../../../core/di/injection/decorators';
import { UseBindings } from '../../../../core/di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../../core/di/binding/binding-registry';
import { DocumentMetadata } from './document-metadata-host';

class OrdersRoute {}
class FiltersRoute {}
class OtherRoute {}
class SlowRoute {}

@Controller()
class OrdersController {
  constructor(@Inject(MetadataServiceInterface) readonly metadata: MetadataServiceInterface) {}
}
@Controller()
class SecondController {
  constructor(@Inject(MetadataServiceInterface) readonly metadata: MetadataServiceInterface) {}
}
class Bindings {
  register(registry: BindingRegistryInterface) {
    registry.bind(OrdersController).toSelf().inSingletonScope();
    registry.bind(SecondController).toSelf().inSingletonScope();
  }
}
@Metadata({ title: 'Заказы', description: 'Список заказов' })
@UseBindings(Bindings)
@Module({ view: () => <div>Orders</div> })
class OrdersModule {}
@Metadata({ title: 'Настройка фильтров' })
@Module({ view: () => <div>Filters</div> })
class FiltersModule {}
@Metadata({ title: 'Клиенты' })
@Module({ view: () => <div>Other</div> })
class OtherModule {}

const shellRender = vi.fn((context: ShellContextInterface) => <aside>{context.content}</aside>);
@Shell()
class TestShell extends ShellInterface {
  render = shellRender;
}

@Metadata({ title: 'Личный кабинет', description: 'Базовое описание' })
class TestApplication extends Application {
  readonly bridge;
  constructor(private readonly router: Router) {
    const bridge = createWebRouterBridge();
    super({ routerBridge: bridge });
    this.bridge = bridge;
  }
  protected configure(app: ApplicationConfiguratorInterface) {
    app.router(this.router);
  }
  get navigate() {
    return this.getApplicationScope().get(NavigateServiceInterface);
  }
  get metadata() {
    return this.getApplicationScope().get(MetadataServiceInterface);
  }
  get routes() {
    return this.getRouterRuntime().getActiveRouteRuntimes();
  }
}
const apps: TestApplication[] = [];
const start = async (slow?: () => Promise<Record<string, unknown>>) => {
  window.history.replaceState(null, '', '/orders');
  const router = new Router({
    routes: [
      new Route({
        token: OrdersRoute,
        address: segments('orders'),
        load: async () => ({ OrdersModule }),
        routing: [
          new Router({
            shell: TestShell,
            routes: [
              new Route({ token: FiltersRoute, address: segments('filters'), load: async () => ({ FiltersModule }) }),
            ],
          }),
        ],
      }),
      new Route({ token: OtherRoute, address: segments('other'), load: async () => ({ OtherModule }) }),
      new Route({ token: SlowRoute, address: segments('slow'), load: slow ?? (async () => ({ OtherModule })) }),
    ],
  });
  const app = new TestApplication(router);
  apps.push(app);
  app.compose();
  await app.initialize();
  const View = app.createView();
  render(
    <React.StrictMode>
      <View />
    </React.StrictMode>,
  );
  return app;
};

afterEach(async () => {
  cleanup();
  await Promise.all(apps.splice(0).map((app) => app.dispose()));
  document.head.querySelectorAll('meta[name="description"]').forEach((element) => element.remove());
  document.title = '';
  shellRender.mockClear();
});

describe('document metadata ownership', () => {
  it('composes application/page/frame, exposes local shell values and restores the selected branch on Back', async () => {
    const app = await start();
    expect(document.title).toBe('Личный кабинет: Заказы');
    const page = app.routes[0]!.getPresentationModuleOrNull()!;
    const first = page.controllers.get(OrdersController) as OrdersController;
    const second = page.controllers.get(SecondController) as SecondController;
    expect(first.metadata).toBe(second.metadata);
    expect(first.metadata).not.toBe(app.metadata);
    await act(async () => app.navigate.to(FiltersRoute));
    expect(document.title).toBe('Личный кабинет: Заказы (Настройка фильтров)');
    expect(shellRender.mock.calls.at(-1)![0].metadata.title).toBe('Настройка фильтров');
    const frame = app.routes.at(-1)!.getPresentationModuleOrNull()!.scope.get(MetadataServiceInterface);
    act(() => frame.set.title('Избранные фильтры'));
    expect(document.title).toBe('Личный кабинет: Заказы (Избранные фильтры)');
    expect(first.metadata.get.title()).toBe('Заказы');
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Список заказов');
    act(() => first.metadata.set.title('Архив заказов'));
    expect(document.title).toBe('Личный кабинет: Архив заказов (Избранные фильтры)');
    await act(async () => app.navigate.to(OtherRoute));
    expect(document.title).toBe('Личный кабинет: Клиенты');
    act(() => first.metadata.set.title('Сохранённые заказы'));
    expect(document.title).toBe('Личный кабинет: Клиенты');
    expect(first.metadata.get.title()).toBe('Архив заказов'); // Departed web owner was disposed.
    await act(async () => app.bridge.back());
    await waitFor(() => expect(document.title).toBe('Личный кабинет: Заказы (Настройка фильтров)'));
    await act(async () => app.navigate.to(OrdersRoute));
    expect(document.title).toBe('Личный кабинет: Заказы');
    act(() => app.routes[0]!.getPresentationModuleOrNull()!.scope.get(MetadataServiceInterface).reset.title());
    expect(document.title).toBe('Личный кабинет: Заказы');
  });

  it('does not publish an uncommitted lazy module when navigation is cancelled', async () => {
    let resolve!: (exports: Record<string, unknown>) => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>((done) => {
      entered = done;
    });
    const slow = new Promise<Record<string, unknown>>((done) => {
      resolve = done;
    });
    const app = await start(() => {
      entered();
      return slow;
    });
    let pending!: Promise<void>;
    act(() => {
      pending = app.navigate.to(SlowRoute);
    });
    await enteredPromise;
    expect(document.title).toBe('Личный кабинет: Заказы');
    let next!: Promise<void>;
    act(() => {
      next = app.navigate.to(FiltersRoute);
    });
    await act(async () => {
      resolve({ OtherModule });
      await Promise.all([pending, next]);
    });
    expect(document.title).toBe('Личный кабинет: Заказы (Настройка фильтров)');
  });

  it('restores existing document nodes on cleanup and does not duplicate description in StrictMode', () => {
    document.title = 'Original';
    const original = document.createElement('meta');
    original.name = 'description';
    original.content = 'Original description';
    document.head.append(original);
    const view = render(
      <React.StrictMode>
        <DocumentMetadata values={{ title: 'New', description: 'New description' }} />
      </React.StrictMode>,
    );
    expect(document.title).toBe('New');
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    view.rerender(
      <React.StrictMode>
        <DocumentMetadata values={{ title: 'Second' }} />
      </React.StrictMode>,
    );
    expect(original.content).toBe('Original description');
    view.unmount();
    expect(document.title).toBe('Original');
    expect(document.head.querySelector('meta[name="description"]')).toBe(original);
    expect(original.content).toBe('Original description');
  });

  it('does not overwrite Next-owned metadata when leaving a framework page', () => {
    document.title = 'Server page';
    const description = document.createElement('meta');
    description.name = 'description';
    description.content = 'Server description';
    document.head.append(description);
    const view = render(
      <React.StrictMode>
        <DocumentMetadata values={{ title: 'Updated', description: 'Updated description' }} restoreOnUnmount={false} />
      </React.StrictMode>,
    );
    view.rerender(
      <React.StrictMode>
        <DocumentMetadata values={{}} restoreOnUnmount={false} />
      </React.StrictMode>,
    );
    expect(document.title).toBe('Server page');
    expect(description.content).toBe('Server description');
    document.title = 'Next route';
    description.content = 'Next description';
    view.unmount();
    expect(document.title).toBe('Next route');
    expect(description.content).toBe('Next description');
  });
});
