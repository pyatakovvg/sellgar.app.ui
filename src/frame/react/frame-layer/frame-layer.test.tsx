import 'reflect-metadata';

import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ResolvedApplicationFrames } from '../../../application/config/application-configurator';
import { SessionRuntimeState, SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { UseBindings } from '../../../di/composition/use-bindings';
import { RouterRuntime, type RouteRuntimeHandle } from '../../../router/runtime/router-runtime';
import { NavigateServiceInterface } from '../../../router/service/navigate-service';
import { RouterServiceBindings } from '../../../router/service/router-service';
import { RouterServiceControllerInterface } from '../../../router/service/router-service-controller';
import { RuntimeScopeProvider } from '../../../runtime/react';
import { ApplicationScope } from '../../../runtime/scope/kind';
import { useParams } from '../../../controller/react/use-params';

import { Frame, FrameShell, FrameShellInterface, type FrameShellContextInterface } from '../../declaration/frame';
import { FrameRoute, FrameRouter } from '../../router/declaration';
import { FrameRuntime } from '../../runtime/frame-runtime';

import { FrameLayer } from './';

describe('FrameLayer', () => {
  it('renders a routed frame through the global application shell', async () => {
    const fixture = createFixture();
    fixture.register(new FrameRouter({ baseSource: 'employees/:id', routes: [frameRoute()] }));
    fixture.syncLocation('#employees/42');

    render(fixture.render());

    expect(await screen.findByText('Global shell')).toBeInTheDocument();
    expect(await screen.findByText('Employee 42')).toBeInTheDocument();
  });

  it('lets a concrete FrameRouter replace the global shell for its whole flow', async () => {
    const fixture = createFixture();
    fixture.register(
      new FrameRouter({
        baseSource: 'employees/:id',
        routes: [frameRoute()],
        shell: ModalFrameShell,
      }),
    );
    fixture.syncLocation('#employees/42');

    render(fixture.render());

    expect(await screen.findByText('Modal shell')).toBeInTheDocument();
    expect(screen.queryByText('Global shell')).not.toBeInTheDocument();
  });

  it('shows the global frame fallback inside the shell while lazy import is pending', async () => {
    const fixture = createFixture();
    const deferred = createDeferred<Record<string, unknown>>();

    fixture.register(
      new FrameRouter({
        baseSource: 'employees/:id',
        routes: [new FrameRoute({ load: () => deferred.promise })],
      }),
    );
    fixture.syncLocation('#employees/42');

    render(fixture.render());

    expect(await screen.findByText('Global shell')).toBeInTheDocument();
    expect(screen.getByText('Global frame fallback')).toBeInTheDocument();

    await act(async () => deferred.resolve({ EmployeeFrame }));

    expect(await screen.findByText('Employee 42')).toBeInTheDocument();
  });

  it('does not resolve a FrameRouter from an inactive ordinary route', () => {
    const fixture = createFixture();
    const frameRouter = new FrameRouter({ baseSource: 'employees/:id', routes: [frameRoute()] });

    fixture.routerRuntime.register('employees', createRouteRuntimeHandle(fixture.scope), { frames: [frameRouter] });
    fixture.routerRuntime.syncActiveRoutes([]);
    fixture.syncLocation('#employees/42');

    render(fixture.render([]));

    expect(screen.queryByText('Global shell')).not.toBeInTheDocument();
  });

  it('contains frame view render errors inside the active frame runtime', async () => {
    const failRender = vi.spyOn(FrameRuntime.prototype, 'failRender');
    const fixture = createFixture();
    fixture.register(
      new FrameRouter({
        baseSource: 'broken',
        routes: [new FrameRoute({ load: async () => ({ ThrowingFrame }) })],
      }),
    );
    fixture.syncLocation('#broken');

    render(fixture.render());

    expect(await screen.findByText('Frame exception')).toBeInTheDocument();
    expect(failRender).toHaveBeenCalledOnce();
    expect(
      fixture.routerRuntime.resolveActiveFrame(['employees'], '#broken')?.preparedRuntime.getSnapshot().phase,
    ).toBe('ready');
  });

  it('reuses a frame prepared by the router loader when the frame layer mounts', async () => {
    const fixture = createFixture();
    const load = vi.fn(async () => ({ EmployeeFrame }));
    const frameRouter = new FrameRouter({
      baseSource: 'employees/:id',
      routes: [new FrameRoute({ load })],
    });

    fixture.routerRuntime.register('employees', createRouteRuntimeHandle(fixture.scope), { frames: [frameRouter] });
    fixture.syncLocation('#employees/42');

    await fixture.routerRuntime.preloadFrame(['employees'], '#employees/42', {
      app: new TestApplicationController(),
      location: {
        hash: '#employees/42',
        hashParams: {},
        key: 'https://example.test/#employees/42',
        params: {},
        pathname: '/',
        search: '',
        searchParams: {},
        state: null,
      },
      navigateService: fixture.scope.get(NavigateServiceInterface),
      session: fixture.scope.get(SessionRuntimeStateInterface),
      signal: new AbortController().signal,
    });

    render(fixture.render());

    expect(await screen.findByText('Employee 42')).toBeInTheDocument();
    expect(load).toHaveBeenCalledOnce();
  });
});

const frameRoute = (): FrameRoute => new FrameRoute({ load: async () => ({ EmployeeFrame }) });

const createFixture = () => {
  const scope = new ApplicationScope();
  const routerRuntime = new RouterRuntime();

  scope.bindRouterRuntime(routerRuntime);
  scope.activate(TestApplicationOwner);
  scope.get(RouterServiceControllerInterface).attachNavigator({
    back: vi.fn(async () => {}),
    navigate: vi.fn(async () => {}),
  });

  return {
    routerRuntime,
    scope,
    register: (frameRouter: FrameRouter) => {
      routerRuntime.register('employees', createRouteRuntimeHandle(scope), { frames: [frameRouter] });
      routerRuntime.syncActiveRoutes(['employees']);
    },
    render: (routeIds: readonly string[] = ['employees']) => (
      <RuntimeScopeProvider scope={scope}>
        <FrameLayer
          app={new TestApplicationController()}
          configuration={FRAME_CONFIGURATION}
          routeIds={routeIds}
          routerRuntime={routerRuntime}
        />
      </RuntimeScopeProvider>
    ),
    syncLocation: (hash: string) => {
      scope.get(RouterServiceControllerInterface).syncLocation({
        hash,
        key: `location:${hash}`,
        params: {},
        pathname: '/',
        search: '',
        state: null,
      });
    },
  };
};

const createRouteRuntimeHandle = (scope: ApplicationScope): RouteRuntimeHandle => ({
  commit: vi.fn(),
  discardPending: vi.fn(),
  dispose: vi.fn(async () => {}),
  getRouteScope: () => scope,
});

interface EmployeeFrameParams {
  readonly id: string;
}

const EmployeeFrameView = () => {
  const { id } = useParams<EmployeeFrameParams>();

  return <div>{`Employee ${id}`}</div>;
};

@Frame({ view: EmployeeFrameView })
class EmployeeFrame {}

const ThrowingFrameView = (): never => {
  throw new Error('Frame render failed.');
};

@Frame({ exception: <div>Frame exception</div>, view: ThrowingFrameView })
class ThrowingFrame {}

@FrameShell()
class GlobalFrameShell implements FrameShellInterface {
  render({ content }: FrameShellContextInterface): React.ReactNode {
    return (
      <div>
        <div>Global shell</div>
        {content}
      </div>
    );
  }
}

@FrameShell()
class ModalFrameShell implements FrameShellInterface {
  render({ content }: FrameShellContextInterface): React.ReactNode {
    return (
      <div>
        <div>Modal shell</div>
        {content}
      </div>
    );
  }
}

const FRAME_CONFIGURATION: ResolvedApplicationFrames = {
  exception: <div>Global frame exception</div>,
  fallback: <div>Global frame fallback</div>,
  forbidden: <div>Global frame forbidden</div>,
  notFound: <div>Global frame not found</div>,
  shell: GlobalFrameShell,
};

class TestApplicationBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    new RouterServiceBindings().register(registry);
    registry.bind(SessionRuntimeStateInterface).toConstantValue(new SessionRuntimeState());
  }
}

@UseBindings(TestApplicationBindings)
class TestApplicationOwner {}

class TestApplicationController {
  readonly lifecycle = { error: null, phase: 'ready' as const };
}

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  readonly resolve: (value: TValue) => void;
}

const createDeferred = <TValue,>(): Deferred<TValue> => {
  let resolve!: (value: TValue) => void;
  const promise = new Promise<TValue>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
};
