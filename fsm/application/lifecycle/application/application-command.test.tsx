import { IsString } from 'class-validator';
import { Expose } from 'class-transformer';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

import { Controller, Inject, UseBindings, segments, type BindingRegistryInterface } from '../../../../core';
import {
  Application,
  Module,
  Route,
  Router,
  State,
  Commands,
  Command,
  ScreenServiceInterface,
  CommandsServiceInterface,
  FsmTransportInterface,
  createFsmRouterBridge,
  useLoaderData,
  useSubmit,
  type ApplicationConfiguratorInterface,
  type FsmSnapshotSourceListener,
  type CommandHandler,
} from '../../../index';

class Model {
  @Expose()
  @IsString()
  readonly title: string;
}

class Advance {}
class Change {}

class ScreenCommands {
  @Command(Advance)
  readonly advance: CommandHandler<Advance>;
}

class SharedCommands {
  @Command(Change)
  readonly change: CommandHandler<Change>;
}

class ScreenToken {
  @State(Model)
  readonly state: Model;

  @Commands(ScreenCommands)
  readonly commands: ScreenCommands;
}

class SecondToken {
  @State(Model)
  readonly state: Model;

  @Commands(ScreenCommands)
  readonly commands: ScreenCommands;
}

interface Snapshot {
  readonly route: string;
  readonly title: string;
}

const fixture = () => {
  const sent = Promise.withResolvers<string>();
  const http = Promise.withResolvers<void>();
  const nextModule = Promise.withResolvers<void>();
  const loading = vi.fn();
  const nextData = Promise.withResolvers<void>();
  const refreshData = Promise.withResolvers<void>();
  const loadingData = vi.fn();
  const refreshingData = vi.fn();
  let holdRefresh = false;
  const transport: FsmTransportInterface = {
    state: (snapshot) => {
      if (typeof snapshot !== 'object' || snapshot === null || !('title' in snapshot)) {
        throw new Error('Missing state');
      }

      return { title: snapshot.title };
    },
    available: () => true,
    send: vi.fn(async (_snapshot, _command, _payload, _signal, id) => {
      sent.resolve(id);
      await http.promise;
    }),
  };

  @Controller()
  class ActionController {
    constructor(@Inject(ScreenServiceInterface) private readonly screen: ScreenServiceInterface) {}

    action(): Promise<void> {
      return this.screen.get(ScreenToken).commands.advance();
    }

    async loader(): Promise<Model> {
      const state = await this.screen.get(ScreenToken).state;

      if (holdRefresh) {
        refreshingData();
        await refreshData.promise;
      }

      return state;
    }
  }

  @Controller()
  class NextController {
    async loader(): Promise<string> {
      loadingData();
      await nextData.promise;
      return 'next screen';
    }
  }

  class NextBindings {
    register(registry: BindingRegistryInterface): void {
      registry.bind(NextController).toSelf();
    }
  }

  const FirstView: React.FC = () => {
    const data = useLoaderData(ActionController);
    const submit = useSubmit(ActionController);

    return (
      <button onClick={() => void submit()}>
        {data.title}:{submit.inProcess ? 'processing' : 'idle'}
      </button>
    );
  };

  const NextView: React.FC = () => <div>{useLoaderData(NextController)}</div>;

  class ModuleBindings {
    register(registry: BindingRegistryInterface): void {
      registry.bind(ActionController).toSelf();
    }
  }

  @UseBindings(ModuleBindings)
  @Module({ view: FirstView })
  class First {}

  @UseBindings(NextBindings)
  @Module({ view: NextView })
  class Second {}

  class AppBindings {
    register(registry: BindingRegistryInterface): void {
      registry.bind(FsmTransportInterface).toConstantValue(transport);
    }
  }

  let listener: FsmSnapshotSourceListener<Snapshot> = () => {
    throw new Error('Not subscribed');
  };

  @UseBindings(AppBindings)
  class App extends Application {
    get scope() {
      return this.getApplicationScope();
    }

    get activeRoutes() {
      return this.getRouterRuntime().getActiveRouteRuntimes();
    }

    protected configure(app: ApplicationConfiguratorInterface): void {
      app.components({
        splash: <div>startup</div>,
        exception: <div>failed</div>,
        notFound: <div>not found</div>,
      });
      app.router(
        new Router({
          routes: [
            new Route({ token: ScreenToken, address: segments('first'), load: async () => ({ First }) }),
            new Route({
              token: SecondToken,
              address: segments('second'),
              load: async () => {
                loading();
                await nextModule.promise;
                return { Second };
              },
            }),
          ],
        }),
      );
    }
  }

  const app = new App({
    routerBridge: createFsmRouterBridge({
      routingKey: 'route',
      source: {
        subscribe: (handler) => {
          listener = handler;
          return { dispose: vi.fn() };
        },
      },
    }),
  });

  const start = async () => {
    app.compose();
    const ready = app.initialize();
    await vi.waitFor(() => expect(app.lifecycle.phase).toBe('initializing'));
    await vi.waitFor(async () => {
      await listener({ route: 'first', title: 'initial' });
    });
    await ready;
  };

  return {
    app,
    start,
    transport,
    sent: sent.promise,
    http,
    loading,
    nextModule,
    nextData,
    refreshData,
    loadingData,
    refreshingData,
    holdRefresh: () => {
      holdRefresh = true;
    },
    ActionController,
    publish: (snapshot: Snapshot) => listener(snapshot),
  };
};

describe('FSM application command completion', () => {
  it.each(['ready', 'failed'] as const)('retains the processing screen until the next route is %s', async (outcome) => {
    const f = fixture();
    await f.start();
    const View = f.app.createView();
    const presentations: (string | null)[] = [];
    const root = render(
      <React.Profiler id={'navigation'} onRender={() => presentations.push(document.body.textContent)}>
        <View />
      </React.Profiler>,
    );
    const [runtime] = f.app.activeRoutes;
    if (!runtime) throw new Error('Missing route');
    let operation = Promise.resolve();
    let publication: void | Promise<void>;

    try {
      act(() => {
        operation = runtime.action(f.ActionController, undefined);
      });
      await f.sent;
      f.http.resolve();
      await screen.findByText('initial:processing');

      act(() => {
        publication = f.publish({ route: 'second', title: 'next' });
      });
      await waitFor(() => expect(f.loading).toHaveBeenCalledOnce());
      expect(screen.getByText('initial:processing')).toBeInTheDocument();

      await act(async () => {
        f.nextModule.resolve();
      });
      await waitFor(() => expect(f.loadingData).toHaveBeenCalledOnce());
      expect(screen.getByText('initial:processing')).toBeInTheDocument();

      await act(async () => {
        if (outcome === 'failed') f.nextData.reject(new Error('Loader failed'));
        else f.nextData.resolve();
        await publication;
        await operation;
      });

      expect(screen.getByText(outcome === 'ready' ? 'next screen' : 'failed')).toBeInTheDocument();
      expect(screen.queryByText('initial:processing')).toBeNull();
      expect(presentations.length).toBeGreaterThan(1);
      expect(
        presentations.every((text) =>
          ['initial:idle', 'initial:processing', outcome === 'ready' ? 'next screen' : 'failed'].includes(text ?? ''),
        ),
      ).toBe(true);
    } finally {
      f.nextModule.resolve();
      f.nextData.resolve();
      root.unmount();
      await f.app.dispose();
      await operation;
    }
  });

  it('settles a command on the notFound presentation and can prepare the next valid route without fallback', async () => {
    const f = fixture();
    await f.start();
    const View = f.app.createView();
    const root = render(<View />);
    const [runtime] = f.app.activeRoutes;
    if (!runtime) throw new Error('Missing route');
    let operation = Promise.resolve();
    let publication: void | Promise<void>;

    try {
      act(() => {
        operation = runtime.action(f.ActionController, undefined);
      });
      await f.sent;
      f.http.resolve();
      await act(async () => {
        await f.publish({ route: 'missing', title: 'unknown' });
        await operation;
      });
      expect(screen.getByText('not found')).toBeInTheDocument();

      act(() => {
        publication = f.publish({ route: 'second', title: 'next' });
      });
      await waitFor(() => expect(f.loading).toHaveBeenCalledOnce());
      expect(screen.getByText('not found')).toBeInTheDocument();

      await act(async () => {
        f.nextModule.resolve();
        f.nextData.resolve();
        await publication;
      });
      expect(screen.getByText('next screen')).toBeInTheDocument();
    } finally {
      f.nextModule.resolve();
      f.nextData.resolve();
      root.unmount();
      await f.app.dispose();
      await operation;
    }
  });

  it('keeps processing until same-route loaders finish, not merely until navigation is committed', async () => {
    const f = fixture();
    await f.start();
    const View = f.app.createView();
    const root = render(<View />);
    const [runtime] = f.app.activeRoutes;
    if (!runtime) throw new Error('Missing route');
    let operation = Promise.resolve();
    let publication: void | Promise<void>;
    const completed = vi.fn();

    try {
      act(() => {
        operation = runtime.action(f.ActionController, undefined);
      });
      void operation.then(completed);
      await f.sent;
      f.http.resolve();
      f.holdRefresh();
      act(() => {
        publication = f.publish({ route: 'first', title: 'updated' });
      });
      await waitFor(() => expect(f.refreshingData).toHaveBeenCalledOnce());

      expect(completed).not.toHaveBeenCalled();
      expect(screen.getByText('initial:processing')).toBeInTheDocument();

      await act(async () => {
        f.refreshData.resolve();
        await publication;
        await operation;
      });
      expect(screen.getByText('updated:idle')).toBeInTheDocument();
      expect(completed).toHaveBeenCalledOnce();
    } finally {
      f.refreshData.resolve();
      root.unmount();
      await f.app.dispose();
      await operation;
    }
  });

  it('keeps action processing through HTTP success and module loading until snapshot is applied', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const f = fixture();
    await f.start();
    const [runtime] = f.app.activeRoutes;
    if (!runtime) throw new Error('Missing route');
    const operation = runtime.action(f.ActionController, undefined);
    await f.sent;
    const completed = vi.fn();
    void operation.then(completed);
    f.http.resolve();

    await Promise.resolve();

    expect(runtime.getActionState(f.ActionController).inProcess).toBe(true);
    expect(completed).not.toHaveBeenCalled();

    const publication = f.publish({ route: 'second', title: 'next' });
    await vi.waitFor(() => expect(f.loading).toHaveBeenCalledOnce());

    expect(runtime.getActionState(f.ActionController).inProcess).toBe(true);
    expect(completed).not.toHaveBeenCalled();

    f.nextModule.resolve();
    f.nextData.resolve();
    await publication;
    await operation;

    expect(completed).toHaveBeenCalledOnce();
    expect(f.app.activeRoutes[0]).not.toBe(runtime);

    const nextCommand = f.app.scope.get(CommandsServiceInterface).get(SharedCommands)?.change();
    await vi.waitFor(() => expect(transportCalls(f.transport)).toBe(2));
    await f.publish({ route: 'second', title: 'next command applied' });
    await nextCommand;

    await f.app.dispose();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('confirms same-screen updates and shares exclusion between route and application commands', async () => {
    const f = fixture();
    await f.start();
    const [runtime] = f.app.activeRoutes;
    if (!runtime) throw new Error('Missing route');
    const operation = runtime.action(f.ActionController, undefined);
    await f.sent;
    const shared = f.app.scope.get(CommandsServiceInterface).get(SharedCommands);
    if (!shared) throw new Error('Missing commands');

    await expect(shared.change()).rejects.toThrow('ожидает snapshot');
    expect(transportCalls(f.transport)).toBe(1);

    await f.publish({ route: 'first', title: 'updated' });
    await operation;
    // Snapshot confirmation is authoritative even with a still-pending HTTP response.
    f.http.resolve();

    await f.app.dispose();
  });

  it('cancels pending confirmation when application is disposed before the next snapshot', async () => {
    const f = fixture();
    await f.start();
    const shared = f.app.scope.get(CommandsServiceInterface).get(SharedCommands);
    if (!shared) throw new Error('Missing commands');
    const operation = shared.change();
    const failed = expect(operation).rejects.toThrow('освобождено');
    await f.sent;
    f.http.resolve();

    expect(f.app.scope.get(CommandsServiceInterface).get(SharedCommands)?.change()).toBe(operation);
    await f.app.dispose();
    await failed;
  });
});

const transportCalls = (transport: FsmTransportInterface): number => vi.mocked(transport.send).mock.calls.length;
