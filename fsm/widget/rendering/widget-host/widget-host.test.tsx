import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controller, UseBindings, type BindingRegistryInterface, type ControllerArgs } from '../../../../core';
import { SessionRuntimeState } from '../../../../core/application/session/session-runtime-state';
import { ApplicationScope } from '../../../../core/runtime/scope/kind/application-scope';
import { WidgetRuntimeRegistry } from '../../../../core/widget/runtime/widget-runtime-registry';
import { bindProviderScope, Provider, type ProviderInterface } from '../../../../core/runtime/provider/provider';
import { ApplicationComponentsProvider } from '../../../application/rendering/application-components-context';
import { RuntimeScopeProvider } from '../../../runtime/scope/runtime-scope-context';
import {
  Widget,
  WidgetDefinition,
  WidgetHost,
  useWidgetProps,
  useLoaderData,
  useSubmit,
  useException,
  WidgetPreloaderInterface,
} from '../../../index';

const pending = () => {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

interface Props {
  readonly value: string;
}
const PropsView: React.FC = () => <span>{useWidgetProps<Props>().value}</span>;
@Widget<Props>({ view: PropsView })
class PropsWidget extends WidgetDefinition<Props> {}

const fixture = () => {
  const scope = new ApplicationScope();
  scope.bindSession(new SessionRuntimeState());
  const registry = scope.get(WidgetRuntimeRegistry);
  const tree = (children: React.ReactNode) => (
    <ApplicationComponentsProvider components={{ exception: <span>global error</span> }}>
      <RuntimeScopeProvider scope={scope}>{children}</RuntimeScopeProvider>
    </ApplicationComponentsProvider>
  );
  return { scope, registry, tree };
};

afterEach(() => vi.restoreAllMocks());

describe('FSM WidgetHost', () => {
  it('reuses the core runtime in StrictMode, updates props and releases it on unmount', async () => {
    const f = fixture();
    const acquire = vi.spyOn(f.registry, 'acquire');
    const tree = (value: string) => (
      <React.StrictMode>{f.tree(<WidgetHost token={PropsWidget} props={{ value }} />)}</React.StrictMode>
    );
    const view = render(tree('first'));
    try {
      await screen.findByText('first');
      const initial = f.registry.get({ ownerScope: f.scope, token: PropsWidget });
      expect(initial).not.toBeNull();
      expect(acquire.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(new Set(acquire.mock.results.map((r) => r.value.runtime)).size).toBe(1);
      view.rerender(tree('second'));
      await screen.findByText('second');
      expect(f.registry.get({ ownerScope: f.scope, token: PropsWidget })).toBe(initial);
      view.unmount();
      await waitFor(() => expect(f.registry.get({ ownerScope: f.scope, token: PropsWidget })).toBeNull());
      await waitFor(() => expect(initial?.getSnapshot().phase).toBe('disposed'));
    } finally {
      view.unmount();
      await f.scope.disposeWidgetRuntimes();
      f.scope.dispose();
    }
  });

  it('connects widget loaders/actions to FSM hooks and cleans up providers/controllers', async () => {
    const gate = pending();
    const released = vi.fn();
    const disposed = vi.fn();
    const action = vi.fn();
    @Controller()
    class Data {
      async loader() {
        await gate.promise;
        return 'widget data';
      }
      action = action;
      dispose = disposed;
    }
    @Provider()
    class Process implements ProviderInterface {
      initialize() {
        return released;
      }
      dispose() {}
    }
    class Bindings {
      register(registry: BindingRegistryInterface) {
        registry.bind(Data).toSelf();
      }
    }
    const View: React.FC = () => {
      const data = useLoaderData(Data);
      const submit = useSubmit(Data);
      return <button onClick={() => void submit()}>{data}</button>;
    };
    @UseBindings(Bindings)
    @Widget({ view: View, providers: [Process] })
    class Token extends WidgetDefinition {}
    const f = fixture();
    const view = render(f.tree(<WidgetHost token={Token} />));
    try {
      await waitFor(() => expect(f.registry.get({ ownerScope: f.scope, token: Token })).toBeDefined());
      expect(view.container).toBeEmptyDOMElement();
      await act(async () => gate.resolve());
      fireEvent.click(await screen.findByText('widget data'));
      await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
      expect(screen.getByText('widget data')).toBeInTheDocument();
    } finally {
      view.unmount();
      await f.scope.disposeWidgetRuntimes();
      f.scope.dispose();
    }
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(released).toHaveBeenCalledTimes(1);
  });

  it('renders widget-local exception with FSM exception context on loader failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('loader failed');
    const observed: unknown[] = [];
    @Controller()
    class Broken {
      loader() {
        throw error;
      }
    }
    class Bindings {
      register(registry: BindingRegistryInterface) {
        registry.bind(Broken).toSelf();
      }
    }
    const Exception: React.FC = () => {
      observed.push(useException());
      return <span>widget error</span>;
    };
    @UseBindings(Bindings)
    @Widget({ view: () => <span>unexpected</span>, exception: <Exception /> })
    class Token extends WidgetDefinition {}
    const f = fixture();
    const view = render(f.tree(<WidgetHost token={Token} />));
    try {
      await screen.findByText('widget error');
      expect(observed.length).toBeGreaterThan(0);
      expect(observed.every(Boolean)).toBe(true);
      expect(screen.queryByText('global error')).toBeNull();
      expect(f.registry.get({ ownerScope: f.scope, token: Token })?.getSnapshot().phase).toBe('failed');
    } finally {
      view.unmount();
      await f.scope.disposeWidgetRuntimes();
      f.scope.dispose();
    }
  });

  it('attributes render failures to the widget and uses the application exception fallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    @Widget({
      view: () => {
        throw new Error('render failed');
      },
    })
    class Token extends WidgetDefinition {}
    const f = fixture();
    const view = render(f.tree(<WidgetHost token={Token} />));
    try {
      await screen.findByText('global error');
      await waitFor(() =>
        expect(f.registry.get({ ownerScope: f.scope, token: Token })?.getSnapshot().phase).toBe('failed'),
      );
    } finally {
      view.unmount();
      await f.scope.disposeWidgetRuntimes();
      f.scope.dispose();
    }
  });

  it('consumes a preloaded core runtime without loading providers twice', async () => {
    const prepare = vi.fn();
    @Provider()
    class Process implements ProviderInterface {
      prepare = prepare;
      dispose() {}
    }
    @Widget<Props>({ view: PropsView, providers: [Process] })
    class Token extends WidgetDefinition<Props> {}
    const f = fixture();
    const cleanup = await f.scope
      .get(WidgetPreloaderInterface)
      .preload(bindProviderScope({ signal: new AbortController().signal, params: {}, props: {} }, f.scope), Token, {
        props: { value: 'preloaded' },
      });
    const initial = f.registry.get({ ownerScope: f.scope, token: Token });
    const view = render(f.tree(<WidgetHost token={Token} props={{ value: 'preloaded' }} />));
    try {
      await screen.findByText('preloaded');
      expect(f.registry.get({ ownerScope: f.scope, token: Token })).toBe(initial);
      expect(prepare).toHaveBeenCalledTimes(1);
    } finally {
      view.unmount();
      if (cleanup) await cleanup();
      await f.scope.disposeWidgetRuntimes();
      f.scope.dispose();
    }
  });

  it('isolates instances by runtimeKey', async () => {
    const f = fixture();
    const view = render(
      f.tree(
        <>
          <WidgetHost token={PropsWidget} runtimeKey={'one'} props={{ value: 'one' }} />
          <WidgetHost token={PropsWidget} runtimeKey={'two'} props={{ value: 'two' }} />
        </>,
      ),
    );
    try {
      await screen.findByText('one');
      await screen.findByText('two');
      expect(f.registry.get({ ownerScope: f.scope, token: PropsWidget, runtimeKey: 'one' })).not.toBe(
        f.registry.get({ ownerScope: f.scope, token: PropsWidget, runtimeKey: 'two' }),
      );
    } finally {
      view.unmount();
      await f.scope.disposeWidgetRuntimes();
      f.scope.dispose();
    }
  });

  it('keeps ordinary action errors local without failing the widget', async () => {
    const error = new Error('action failed');
    @Controller()
    class Data {
      loader() {
        return 'loaded';
      }
      action() {
        throw error;
      }
    }
    class Bindings {
      register(registry: BindingRegistryInterface) {
        registry.bind(Data).toSelf();
      }
    }
    const View: React.FC = () => {
      const data = useLoaderData(Data);
      const submit = useSubmit(Data);
      return <button onClick={() => void submit()}>{submit.error === error ? 'action error' : data}</button>;
    };
    @UseBindings(Bindings)
    @Widget({ view: View })
    class Token extends WidgetDefinition {}
    const f = fixture();
    const view = render(f.tree(<WidgetHost token={Token} />));
    try {
      fireEvent.click(await screen.findByText('loaded'));
      await screen.findByText('action error');
      expect(f.registry.get({ ownerScope: f.scope, token: Token })?.getSnapshot().phase).toBe('ready');
      expect(screen.queryByText('global error')).toBeNull();
    } finally {
      view.unmount();
      await f.scope.disposeWidgetRuntimes();
      f.scope.dispose();
    }
  });

  it('aborts loading on unmount and ignores a late loader result', async () => {
    const gate = pending();
    const loaded = vi.fn();
    const disposed = vi.fn();
    let signal: AbortSignal | undefined;
    @Controller()
    class Data {
      async loader(args: ControllerArgs) {
        signal = args.signal;
        loaded();
        await gate.promise;
        return 'late';
      }
      dispose = disposed;
    }
    class Bindings {
      register(registry: BindingRegistryInterface) {
        registry.bind(Data).toSelf();
      }
    }
    @UseBindings(Bindings)
    @Widget({ view: () => <span>{useLoaderData(Data)}</span> })
    class Token extends WidgetDefinition {}
    const f = fixture();
    const view = render(f.tree(<WidgetHost token={Token} />));
    try {
      await waitFor(() => expect(loaded).toHaveBeenCalledTimes(1));
      const runtime = f.registry.get({ ownerScope: f.scope, token: Token });
      view.unmount();
      await waitFor(() => expect(signal?.aborted).toBe(true));
      await act(async () => {
        gate.resolve();
      });
      await waitFor(() => expect(runtime?.getSnapshot().phase).toBe('disposed'));
      expect(disposed).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('late')).toBeNull();
    } finally {
      gate.resolve();
      view.unmount();
      await f.scope.disposeWidgetRuntimes();
      f.scope.dispose();
    }
  });
});
