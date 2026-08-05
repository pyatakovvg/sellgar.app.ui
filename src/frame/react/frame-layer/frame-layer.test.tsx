import 'reflect-metadata';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { Controller } from '../../../controller/contract/controller';

import { ApplicationComponentsProvider } from '../../../application/react/application-components-context';
import { SessionRuntimeState, SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import { BindingModuleInterface } from '../../../di/binding/binding-module';
import { Injectable } from '../../../di/injection/decorators';
import { UseBindings } from '../../../di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { Layout } from '../../../layout/declaration/layout';
import { Policy, PolicyInterface } from '../../../policy/contract/policy';
import type { PolicyResult } from '../../../policy/contract/policy-result';
import { ApplicationScope } from '../../../runtime/scope/kind';
import { RuntimeFailureReporterInterface } from '../../../runtime/failure';
import {
  Provider,
  RuntimeProviderInterface,
  type RuntimeProviderContextInterface,
  type RuntimeProviderResult,
} from '../../../runtime/provider/runtime-provider';
import { RuntimeScopeProvider } from '../../../runtime/react';
import type { RuntimeScope } from '../../../runtime/scope/base';
import { useException } from '../../../react/router/exception';
import { RouterRuntime } from '../../../router/runtime/router-runtime';
import { RouterServiceBindings } from '../../../router/service/router-service';
import { RouterServiceControllerInterface } from '../../../router/service/router-service-controller';
import type { RouteRuntimeHandle } from '../../../router/runtime/router-runtime';
import type { RouteRuntimeContextInterface } from '../../../router/runtime/route-runtime-context';

import { Frame, FrameDefinition, FrameShell, FrameShellInterface } from '../../declaration/frame';
import { FrameBindings } from '../../service/frame-service';
import { HashFrameSource } from '../../source/hash-frame-source';
import type { FrameConstructor, FrameShellContextInterface } from '../../declaration/frame';
import { FrameControllerInterface, type FrameControllerLoaderArgs } from '../../runtime/frame-controller';
import { FrameRuntime } from '../../runtime/frame-runtime';
import { Widget, WidgetDefinition } from '../../../widget/declaration/widget';
import { WidgetControllerInterface } from '../../../widget/runtime/widget-controller';
import { WidgetRuntimeFactoryBindings } from '../../../widget/runtime/widget-runtime-factory';
import { WidgetHost } from '../../../widget/react/widget-host';

import { useFrame } from '../use-frame';
import { useLoaderData } from '../../../controller/react/use-controller-loader-data';

import { FrameLayer } from './';

describe('FrameLayer', () => {
  beforeEach(() => {
    TestFrameProvider.deferred = createDeferred<void>();
    TestFrameProvider.events = [];
    TestFrameController.deferred = createDeferred<void>();
  });

  it('renders active frame views from current route branch and location hash', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [ParentFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation('#parent');

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    await waitFor(() => {
      expect(screen.getByText('Parent frame')).toBeInTheDocument();
    });
  });

  it('updates rendered frames when location hash changes', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [ParentFrame, ChildFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation('#parent');

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    await waitFor(() => {
      expect(screen.getByText('Parent frame')).toBeInTheDocument();
    });

    fixture.syncLocation("#child(id='42')");

    await waitFor(() => {
      expect(screen.queryByText('Parent frame')).not.toBeInTheDocument();
      expect(screen.getByText('Child frame: 42')).toBeInTheDocument();
    });
  });

  it('updates rendered frames when active route branch changes', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [ParentFrame],
    });
    fixture.routerRuntime.register('root.route:1.route:2', fixture.createRouteRuntimeHandle(), {
      frames: [ParentFrame, ChildFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation("#parent&child(id='42')");

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    await waitFor(() => {
      expect(screen.getByText('Parent frame')).toBeInTheDocument();
      expect(screen.queryByText('Child frame: 42')).not.toBeInTheDocument();
    });

    fixture.routerRuntime.syncActiveRoutes(['root.route:1', 'root.route:1.route:2']);

    await waitFor(() => {
      expect(screen.queryByText('Parent frame')).not.toBeInTheDocument();
      expect(screen.getByText('Child frame: 42')).toBeInTheDocument();
    });
  });

  it('renders frame view through configured shell', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [ShellFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation('#shell');

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    await waitFor(() => {
      expect(screen.getByText('Shell open')).toBeInTheDocument();
      expect(screen.getByText('Shell frame content')).toBeInTheDocument();
    });
  });

  it('passes source close handler to configured shell', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [ShellFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation('#shell');

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    fireEvent.click(await screen.findByRole('button', { name: 'Close frame' }));

    await waitFor(() => {
      expect(fixture.navigateMock).toHaveBeenCalledWith('/', {
        replace: true,
        state: undefined,
      });
    });
  });

  it('renders shell-less frame view with current frame controls', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [ShelllessFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation('#shellless');

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    expect(await screen.findByText('Shellless frame open')).toBeInTheDocument();
    expect(screen.queryByText('Shell open')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close shellless frame' }));

    await waitFor(() => {
      expect(fixture.navigateMock).toHaveBeenCalledWith('/', {
        replace: true,
        state: undefined,
      });
    });
  });

  it('renders frame layouts around frame view', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [LayoutFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation('#layout-frame');

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    expect(await screen.findByText('Frame layout')).toBeInTheDocument();
    expect(screen.getByText('Layout frame content')).toBeInTheDocument();
  });

  it('runs frame providers before rendering frame view', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [ProviderFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation("#provider(id='42')");

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    expect(await screen.findByText('Shell open')).toBeInTheDocument();
    expect(await screen.findByText('Provider frame loading')).toBeInTheDocument();
    expect(screen.queryByText('Provider frame: 42')).not.toBeInTheDocument();

    TestFrameProvider.deferred.resolve();

    await waitFor(() => {
      expect(screen.getByText('Provider frame: 42')).toBeInTheDocument();
    });
    expect(TestFrameProvider.events).toEqual(["beforeRender:beforeRender:#provider(id='42')"]);
  });

  it('resolves configured shell from frame scope after reopening hash frame', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [ScopedShellProviderFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation('#scoped-shell-provider');

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    expect(await screen.findByText('Scoped shell open')).toBeInTheDocument();
    expect(await screen.findByText('Scoped shell provider frame loading')).toBeInTheDocument();

    TestFrameProvider.deferred.resolve();

    await waitFor(() => {
      expect(screen.getByText('Scoped shell provider frame')).toBeInTheDocument();
    });

    fixture.syncLocation('');

    await waitFor(() => {
      expect(screen.queryByText('Scoped shell provider frame')).not.toBeInTheDocument();
    });

    fixture.syncLocation('#scoped-shell-provider');

    await waitFor(() => {
      expect(screen.getByText('Scoped shell open')).toBeInTheDocument();
      expect(screen.getByText('Scoped shell provider frame')).toBeInTheDocument();
    });
    expect(fixture.reportFailure).not.toHaveBeenCalled();
  });

  it('renders frame loader data from frame controller', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [ControllerFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation("#controller-frame(id='42')");

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    expect(await screen.findByText('Controller frame loading')).toBeInTheDocument();

    TestFrameController.deferred.resolve();

    await waitFor(() => {
      expect(screen.getByText('Controller frame: 42')).toBeInTheDocument();
    });
  });

  it('stores hash-only frame runtime in router runtime registry', async () => {
    const fixture = createFrameLayerFixture();
    const routeRuntime = fixture.createRouteRuntimeHandle();

    fixture.routerRuntime.register('root.route:1', routeRuntime, {
      frames: [ControllerFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation("#controller-frame(id='42')");

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    expect(await screen.findByText('Controller frame loading')).toBeInTheDocument();

    TestFrameController.deferred.resolve();

    await waitFor(() => {
      expect(screen.getByText('Controller frame: 42')).toBeInTheDocument();
    });

    const runtimeKey = 'controller-frame:{"id":"42"}';
    const preparedRuntime = fixture.routerRuntime.getPreparedFrameRuntime(ControllerFrame, runtimeKey);

    expect(preparedRuntime?.getSnapshot().phase).toBe('ready');
    expect(fixture.routerRuntime.prepareFrameRuntime(ControllerFrame, runtimeKey, { id: '42' }, fixture.appScope)).toBe(
      preparedRuntime,
    );
  });

  it('keeps shell frame open and renders frame error when controller loader fails', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [FailedControllerFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation("#failed-controller-frame(id='9')");

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    expect(await screen.findByText('Shell open')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Frame lifecycle failed')).toBeInTheDocument();
    });
    expect(screen.getByText('Загрузчик контроллера фрейма завершился с ошибкой.')).toBeInTheDocument();
    expect(fixture.navigateMock).not.toHaveBeenCalled();
    expect(fixture.reportFailure).toHaveBeenCalledWith(expect.objectContaining({ disposition: 'frame.failed' }));
  });

  it('renders prepared shell frame error without leaking it to route UI', async () => {
    const fixture = createFrameLayerFixture();

    await fixture.routerRuntime
      .prepareFrameRuntime(FailedControllerFrame, 'failed-controller-frame:{"id":"9"}', { id: '9' }, fixture.appScope)
      .load(createFrameLoadOptions())
      .catch(() => {});
    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [FailedControllerFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation("#failed-controller-frame(id='9')");

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    expect(await screen.findByText('Shell open')).toBeInTheDocument();
    expect(screen.getByText('Frame lifecycle failed')).toBeInTheDocument();
    expect(screen.getByText('Загрузчик контроллера фрейма завершился с ошибкой.')).toBeInTheDocument();
    expect(fixture.reportFailure).toHaveBeenCalledWith(expect.objectContaining({ disposition: 'frame.failed' }));
  });

  it('disposes frame providers when frame becomes inactive', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [ProviderFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation("#provider(id='42')");

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    TestFrameProvider.deferred.resolve();

    await waitFor(() => {
      expect(screen.getByText('Provider frame: 42')).toBeInTheDocument();
    });

    fixture.syncLocation('');

    await waitFor(() => {
      expect(screen.queryByText('Provider frame: 42')).not.toBeInTheDocument();
      expect(TestFrameProvider.events).toContain('dispose');
    });
  });

  it('reports frame provider errors and renders configured frame error', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [FailedProviderFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation('#failed-provider');

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    await waitFor(() => {
      expect(screen.getByText('Frame provider failed')).toBeInTheDocument();
    });
    expect(screen.getByText(/не помечен декоратором @Provider/)).toBeInTheDocument();
    expect(fixture.reportFailure).toHaveBeenCalledWith(expect.objectContaining({ disposition: 'frame.failed' }));
  });

  it('keeps shell frame open when provider resolution fails', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [ShellFailedProviderFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation('#shell-failed-provider');

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    expect(await screen.findByText('Shell open')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Frame provider failed')).toBeInTheDocument();
    });
    expect(screen.getByText(/не помечен декоратором @Provider/)).toBeInTheDocument();
    expect(fixture.navigateMock).not.toHaveBeenCalled();
  });

  it('reuses route exception inside frame host without replacing module content', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      exception: <RouteFrameErrorView />,
      frames: [FailedRouteProviderFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation('#failed-route-provider');

    render(
      fixture.render(
        <>
          <div>Module content remains active</div>
          <FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />
        </>,
      ),
    );

    await waitFor(() => {
      expect(screen.getByText('Route frame provider failed')).toBeInTheDocument();
    });
    expect(screen.getByText('Module content remains active')).toBeInTheDocument();
    expect(fixture.reportFailure).toHaveBeenCalledWith(expect.objectContaining({ disposition: 'frame.failed' }));
  });

  it('contains widget failure inside active frame and module', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [NestedWidgetFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation('#nested-widget-frame');

    render(
      <ApplicationComponentsProvider components={{ exception: <div>Application widget exception</div> }}>
        {fixture.render(
          <>
            <div>Module content remains active</div>
            <FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />
          </>,
        )}
      </ApplicationComponentsProvider>,
    );

    expect(await screen.findByText('Application widget exception')).toBeInTheDocument();
    expect(screen.getByText('Frame content remains active')).toBeInTheDocument();
    expect(screen.getByText('Module content remains active')).toBeInTheDocument();
    expect(screen.queryByText('Route frame provider failed')).not.toBeInTheDocument();
    expect(fixture.reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'widget.failed',
        failure: expect.objectContaining({
          source: expect.objectContaining({
            owner: expect.objectContaining({ kind: 'widget' }),
            participant: expect.objectContaining({ kind: 'controller' }),
          }),
        }),
      }),
    );
  });

  it('contains frame React render errors inside the frame shell', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [RenderFailedFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation('#render-failed-frame');

    render(
      fixture.render(
        <>
          <div>Module content remains active</div>
          <FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />
        </>,
      ),
    );

    expect(await screen.findByText('Shell open')).toBeInTheDocument();
    expect(await screen.findByText('Frame render failed')).toBeInTheDocument();
    expect(screen.getByText('Frame view render failed.')).toBeInTheDocument();
    expect(screen.getByText('Module content remains active')).toBeInTheDocument();
    expect(fixture.reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'frame.failed',
        failure: expect.objectContaining({
          source: expect.objectContaining({
            operation: 'render',
            owner: expect.objectContaining({
              kind: 'frame',
              token: RenderFailedFrame,
            }),
            participant: { kind: 'runtime' },
          }),
        }),
        ownerState: 'failed',
      }),
    );
  });

  it('contains widget React render errors inside the active frame and module', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      frames: [NestedRenderWidgetFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation('#nested-render-widget-frame');

    render(
      <ApplicationComponentsProvider components={{ exception: <div>Application widget exception</div> }}>
        {fixture.render(
          <>
            <div>Module content remains active</div>
            <FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />
          </>,
        )}
      </ApplicationComponentsProvider>,
    );

    expect(await screen.findByText('Application widget exception')).toBeInTheDocument();
    expect(screen.getByText('Frame content remains active')).toBeInTheDocument();
    expect(screen.getByText('Module content remains active')).toBeInTheDocument();
    expect(fixture.reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'widget.failed',
        failure: expect.objectContaining({
          source: expect.objectContaining({
            operation: 'render',
            owner: expect.objectContaining({
              kind: 'widget',
              token: NestedRenderFailedWidget,
            }),
          }),
        }),
      }),
    );
  });

  it('renders registered forbidden view inside frame shell when frame policy denies activation', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      forbidden: <GlobalForbiddenView />,
      frames: [DeniedFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation('#denied-frame');

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    expect(await screen.findByText('Shell open')).toBeInTheDocument();
    expect(await screen.findByText('Global frame forbidden')).toBeInTheDocument();
    expect(screen.queryByText('Denied frame content')).not.toBeInTheDocument();
  });

  it('renders frame forbidden view before registered forbidden view', async () => {
    const fixture = createFrameLayerFixture();

    fixture.routerRuntime.register('root.route:1', fixture.createRouteRuntimeHandle(), {
      forbidden: <GlobalForbiddenView />,
      frames: [CustomDeniedFrame],
    });
    fixture.routerRuntime.syncActiveRoutes(['root.route:1']);
    fixture.syncLocation('#custom-denied-frame');

    render(fixture.render(<FrameLayer app={fixture.app} routerRuntime={fixture.routerRuntime} />));

    expect(await screen.findByText('Shell open')).toBeInTheDocument();
    expect(await screen.findByText('Frame forbidden')).toBeInTheDocument();
    expect(screen.queryByText('Global frame forbidden')).not.toBeInTheDocument();
  });
});

interface FrameLayerFixture {
  readonly app: TestApplicationController;
  readonly appScope: ApplicationScope;
  readonly createRouteRuntimeHandle: (options?: PreparedRuntimeOptions) => RouteRuntimeHandle;
  readonly navigateMock: ReturnType<typeof vi.fn>;
  readonly reportFailure: MockInstance;
  readonly render: (children: React.ReactNode) => React.ReactElement;
  readonly routerRuntime: RouterRuntime;
  readonly syncLocation: (hash: string) => void;
}

const createFrameLayerFixture = (): FrameLayerFixture => {
  const scope = new ApplicationScope();
  const routerRuntime = new RouterRuntime();

  scope.bindRouterRuntime(routerRuntime);
  scope.activate(TestApplicationOwner);
  const reportFailure = vi.spyOn(scope.get(RuntimeFailureReporterInterface), 'report').mockResolvedValue();

  const routerService = scope.get(RouterServiceControllerInterface);
  const app = new TestApplicationController();
  const navigateMock = vi.fn(async () => {});

  routerService.attachNavigator({
    back: vi.fn(async () => {}),
    navigate: navigateMock,
  });

  return {
    app,
    appScope: scope,
    createRouteRuntimeHandle: (options) => {
      return createRouteRuntimeHandle(scope, options);
    },
    navigateMock,
    reportFailure,
    render: (children) => {
      return <RuntimeScopeProvider scope={scope}>{children}</RuntimeScopeProvider>;
    },
    routerRuntime,
    syncLocation: (hash) => {
      routerService.syncLocation({
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

interface PreparedRuntimeOptions<TProps extends object = ProviderFrameProps> {
  readonly frame: FrameConstructor<TProps>;
  readonly runtime: FrameRuntime<TProps>;
  readonly runtimeKey?: string;
}

const createRouteRuntimeHandle = (
  scope: RuntimeScope = new ApplicationScope(),
  options?: PreparedRuntimeOptions,
): RouteRuntimeHandle => {
  const runtimes = new WeakMap<FrameConstructor, Map<string, FrameRuntime<object>>>();

  if (options) {
    const frameRuntimes = new Map<string, FrameRuntime<object>>();

    frameRuntimes.set(createFrameRuntimeKey(options.runtimeKey), options.runtime as unknown as FrameRuntime<object>);
    runtimes.set(options.frame as FrameConstructor, frameRuntimes);
  }

  return {
    commit: vi.fn(),
    discardPending: vi.fn(),
    dispose: vi.fn(async () => {}),
    getPreparedFrameRuntime: <TProps extends object>(
      frame: FrameConstructor<TProps>,
      runtimeKey: string | undefined,
    ): FrameRuntime<TProps> | null => {
      const runtime = runtimes.get(frame)?.get(createFrameRuntimeKey(runtimeKey));

      if (!runtime || runtime.getSnapshot().phase === 'disposed') {
        return null;
      }

      return runtime as FrameRuntime<TProps>;
    },
    prepareFrameRuntime: <TProps extends object>(
      frame: FrameConstructor<TProps>,
      runtimeKey: string | undefined,
      props: TProps,
      ownerScope: RuntimeScope,
    ): FrameRuntime<TProps> => {
      let frameRuntimes = runtimes.get(frame);
      const frameRuntimeKey = createFrameRuntimeKey(runtimeKey);
      const preparedRuntime = frameRuntimes?.get(frameRuntimeKey);

      if (preparedRuntime && preparedRuntime.getSnapshot().phase !== 'disposed') {
        return preparedRuntime as FrameRuntime<TProps>;
      }

      const runtime = new FrameRuntime<TProps>(ownerScope, frame, props);

      if (!frameRuntimes) {
        frameRuntimes = new Map<string, FrameRuntime<object>>();
        runtimes.set(frame, frameRuntimes);
      }

      frameRuntimes.set(frameRuntimeKey, runtime as FrameRuntime<object>);

      return runtime;
    },
    getRuntimeScope: () => scope,
  };
};

const createFrameRuntimeKey = (runtimeKey: string | undefined): string => runtimeKey ?? 'default';

const ParentFrameView = (): React.ReactElement => {
  return <div>Parent frame</div>;
};

interface ChildFrameProps {
  readonly id: string;
}

const ChildFrameView: React.FC<ChildFrameProps> = ({ id }) => {
  return <div>{`Child frame: ${id}`}</div>;
};

const ShellFrameView = (): React.ReactElement => {
  return <div>Shell frame content</div>;
};

const ShelllessFrameView = (): React.ReactElement => {
  const frame = useFrame();

  return (
    <section>
      <div>{frame.open ? 'Shellless frame open' : 'Shellless frame closed'}</div>
      <button onClick={() => void frame.close()} type="button">
        Close shellless frame
      </button>
    </section>
  );
};

const FrameLayoutView: React.FC<React.PropsWithChildren> = ({ children }) => {
  return (
    <section>
      <div>Frame layout</div>
      {children}
    </section>
  );
};

const LayoutFrameView = (): React.ReactElement => {
  return <div>Layout frame content</div>;
};

interface ProviderFrameProps {
  readonly id: string;
}

const ProviderFrameView: React.FC<ProviderFrameProps> = ({ id }) => {
  return <div>{`Provider frame: ${id}`}</div>;
};

const ScopedShellProviderFrameView = (): React.ReactElement => {
  return <div>Scoped shell provider frame</div>;
};

const ControllerFrameView = (): React.ReactElement => {
  const value = useLoaderData(TestFrameController);

  return <div>{`Controller frame: ${value}`}</div>;
};

const FrameErrorView = (): React.ReactElement => {
  const error = useException();

  return (
    <div>
      <div>Frame provider failed</div>
      <div>{error instanceof Error ? error.message : 'Unknown frame error'}</div>
    </div>
  );
};

const FrameLifecycleErrorView = (): React.ReactElement => {
  const error = useException();

  return (
    <div>
      <div>Frame lifecycle failed</div>
      <div>{error instanceof Error ? error.message : 'Unknown frame error'}</div>
    </div>
  );
};

const FrameRenderErrorView = (): React.ReactElement => {
  const error = useException();

  return (
    <div>
      <div>Frame render failed</div>
      <div>{error instanceof Error ? error.message : 'Unknown frame render error'}</div>
    </div>
  );
};

const RouteFrameErrorView = (): React.ReactElement => {
  const error = useException();

  return (
    <div>
      <div>Route frame provider failed</div>
      <div>{error instanceof Error ? error.message : 'Unknown route frame error'}</div>
    </div>
  );
};

const GlobalForbiddenView = (): React.ReactElement => {
  return <div>Global frame forbidden</div>;
};

const FrameForbiddenView = (): React.ReactElement => {
  return <div>Frame forbidden</div>;
};

const DeniedFrameView = (): React.ReactElement => {
  return <div>Denied frame content</div>;
};

@FrameShell()
class TestFrameShell extends FrameShellInterface {
  render(context: FrameShellContextInterface): React.ReactNode {
    return (
      <section>
        <div>{context.open ? 'Shell open' : 'Shell closed'}</div>
        {context.content}
        <button onClick={() => void context.close()} type="button">
          Close frame
        </button>
      </section>
    );
  }
}

@FrameShell()
class TestScopedFrameShell extends FrameShellInterface {
  render(context: FrameShellContextInterface): React.ReactNode {
    return (
      <section>
        <div>{context.open ? 'Scoped shell open' : 'Scoped shell closed'}</div>
        {context.content}
      </section>
    );
  }
}

@Provider()
class TestFrameProvider extends RuntimeProviderInterface {
  static deferred: Deferred<void> = createDeferred();
  static events: string[] = [];

  async beforeRender(context: RuntimeProviderContextInterface): Promise<RuntimeProviderResult> {
    TestFrameProvider.events.push(`beforeRender:${context.phase}:${new URL(context.request.url).hash}`);

    await TestFrameProvider.deferred.promise;

    return () => {
      TestFrameProvider.events.push('dispose');
    };
  }
}

@Controller()
class TestFrameController extends FrameControllerInterface<ProviderFrameProps> {
  static deferred: Deferred<void> = createDeferred();

  async loader(args: FrameControllerLoaderArgs<ProviderFrameProps>): Promise<string> {
    await TestFrameController.deferred.promise;

    return args.props.id;
  }
}

@Controller()
class FailedFrameController extends FrameControllerInterface<ProviderFrameProps> {
  loader(): never {
    throw new Error('Загрузчик контроллера фрейма завершился с ошибкой.');
  }
}

@Injectable()
class MissingFrameProvider extends RuntimeProviderInterface {}

abstract class DeniedFramePolicyInterface extends PolicyInterface<RouteRuntimeContextInterface> {}

@Policy()
class DeniedFramePolicy extends DeniedFramePolicyInterface {
  execute(): PolicyResult {
    return {
      reason: 'denied',
      type: 'fail',
    };
  }
}

class DeniedFrameBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(DeniedFramePolicyInterface).to(DeniedFramePolicy).inSingletonScope();
  }
}

class ControllerFrameBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(TestFrameController).toSelf().inSingletonScope();
  }
}

class FailedControllerFrameBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(FailedFrameController).toSelf().inSingletonScope();
  }
}

@UseBindings(DeniedFrameBindings)
@Frame({
  canActivate: [DeniedFramePolicy],
  shell: TestFrameShell,
  source: HashFrameSource.create('denied-frame'),
  view: DeniedFrameView,
})
class DeniedFrame extends FrameDefinition {}

@UseBindings(DeniedFrameBindings)
@Frame({
  canActivate: [DeniedFramePolicy],
  forbidden: <FrameForbiddenView />,
  shell: TestFrameShell,
  source: HashFrameSource.create('custom-denied-frame'),
  view: DeniedFrameView,
})
class CustomDeniedFrame extends FrameDefinition {}

@Frame({
  source: HashFrameSource.create('parent'),
  view: ParentFrameView,
})
class ParentFrame extends FrameDefinition {}

@Frame<ChildFrameProps>({
  source: HashFrameSource.create('child'),
  view: ChildFrameView,
})
class ChildFrame extends FrameDefinition<ChildFrameProps> {}

@Frame({
  shell: TestFrameShell,
  source: HashFrameSource.create('shell'),
  view: ShellFrameView,
})
class ShellFrame extends FrameDefinition {}

const RenderFailedFrameView = (): React.ReactElement => {
  throw new Error('Frame view render failed.');
};

@Frame({
  exception: <FrameRenderErrorView />,
  shell: TestFrameShell,
  source: HashFrameSource.create('render-failed-frame'),
  view: RenderFailedFrameView,
})
class RenderFailedFrame extends FrameDefinition {}

@Frame({
  source: HashFrameSource.create('shellless'),
  view: ShelllessFrameView,
})
class ShelllessFrame extends FrameDefinition {}

@Layout({
  view: FrameLayoutView,
})
class FrameLayout {}

@Frame({
  layouts: [FrameLayout],
  source: HashFrameSource.create('layout-frame'),
  view: LayoutFrameView,
})
class LayoutFrame extends FrameDefinition {}

@Frame<ProviderFrameProps>({
  fallback: <div>Provider frame loading</div>,
  providers: [TestFrameProvider],
  shell: TestFrameShell,
  source: HashFrameSource.create('provider'),
  view: ProviderFrameView,
})
class ProviderFrame extends FrameDefinition<ProviderFrameProps> {}

@Frame({
  fallback: <div>Scoped shell provider frame loading</div>,
  providers: [TestFrameProvider],
  shell: TestScopedFrameShell,
  source: HashFrameSource.create('scoped-shell-provider'),
  view: ScopedShellProviderFrameView,
})
class ScopedShellProviderFrame extends FrameDefinition {}

@UseBindings(ControllerFrameBindings)
@Frame<ProviderFrameProps>({
  fallback: <div>Controller frame loading</div>,
  source: HashFrameSource.create('controller-frame'),
  view: ControllerFrameView,
})
class ControllerFrame extends FrameDefinition<ProviderFrameProps> {}

@UseBindings(FailedControllerFrameBindings)
@Frame<ProviderFrameProps>({
  exception: <FrameLifecycleErrorView />,
  fallback: <div>Failed controller frame loading</div>,
  shell: TestFrameShell,
  source: HashFrameSource.create('failed-controller-frame'),
  view: ProviderFrameView,
})
class FailedControllerFrame extends FrameDefinition<ProviderFrameProps> {}

@Frame({
  exception: <FrameErrorView />,
  providers: [MissingFrameProvider],
  source: HashFrameSource.create('failed-provider'),
  view: ParentFrameView,
})
class FailedProviderFrame extends FrameDefinition {}

@Frame({
  exception: <FrameErrorView />,
  providers: [MissingFrameProvider],
  shell: TestFrameShell,
  source: HashFrameSource.create('shell-failed-provider'),
  view: ParentFrameView,
})
class ShellFailedProviderFrame extends FrameDefinition {}

@Frame({
  providers: [MissingFrameProvider],
  source: HashFrameSource.create('failed-route-provider'),
  view: ParentFrameView,
})
class FailedRouteProviderFrame extends FrameDefinition {}

@Controller()
class NestedFailedWidgetController extends WidgetControllerInterface {
  loader(): never {
    throw new Error('Nested widget loader failed.');
  }
}

class NestedFailedWidgetBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(NestedFailedWidgetController).toSelf().inSingletonScope();
  }
}

const NestedFailedWidgetView: React.FC = () => {
  useLoaderData(NestedFailedWidgetController);

  return <div>Nested widget content</div>;
};

@UseBindings(NestedFailedWidgetBindings)
@Widget({
  view: NestedFailedWidgetView,
})
class NestedFailedWidget extends WidgetDefinition {}

class NestedWidgetFrameBindings extends BindingModuleInterface {
  register(_registry: BindingRegistryInterface): void {}
}

const NestedWidgetFrameView: React.FC = () => {
  return (
    <div>
      <div>Frame content remains active</div>
      <WidgetHost token={NestedFailedWidget} />
    </div>
  );
};

@UseBindings(NestedWidgetFrameBindings)
@Frame({
  source: HashFrameSource.create('nested-widget-frame'),
  view: NestedWidgetFrameView,
})
class NestedWidgetFrame extends FrameDefinition {}

const NestedRenderFailedWidgetView = (): React.ReactElement => {
  throw new Error('Nested widget render failed.');
};

@Widget({
  view: NestedRenderFailedWidgetView,
})
class NestedRenderFailedWidget extends WidgetDefinition {}

const NestedRenderWidgetFrameView: React.FC = () => {
  return (
    <div>
      <div>Frame content remains active</div>
      <WidgetHost token={NestedRenderFailedWidget} />
    </div>
  );
};

@UseBindings(NestedWidgetFrameBindings)
@Frame({
  source: HashFrameSource.create('nested-render-widget-frame'),
  view: NestedRenderWidgetFrameView,
})
class NestedRenderWidgetFrame extends FrameDefinition {}

class TestApplicationBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    new RouterServiceBindings().register(registry);
    new FrameBindings().register(registry);
    new WidgetRuntimeFactoryBindings().register(registry);
    registry.bind(SessionRuntimeStateInterface).toConstantValue(new SessionRuntimeState());
  }
}

@UseBindings(TestApplicationBindings)
class TestApplicationOwner {}

class TestApplicationController {
  readonly lifecycle = {
    error: null,
    phase: 'ready' as const,
  };
}

const createFrameLoadOptions = () => {
  return {
    app: new TestApplicationController(),
    close: vi.fn(async () => {}),
    location: {
      hash: "#failed-controller-frame(id='9')",
      hashParams: {},
      key: 'location:failed-controller-frame',
      params: {},
      pathname: '/',
      search: '',
      searchParams: {},
      state: null,
    },
    navigateService: {
      back: vi.fn(async () => {}),
      hashParams: vi.fn(async () => {}),
      replace: vi.fn(async () => {}),
      searchParams: vi.fn(async () => {}),
      to: vi.fn(async () => {}),
    },
    session: new SessionRuntimeState(),
  };
};

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  readonly resolve: (value: TValue) => void;
}

function createDeferred<TValue>(): Deferred<TValue> {
  let resolve: Deferred<TValue>['resolve'] = () => {};
  const promise = new Promise<TValue>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return {
    promise,
    resolve,
  };
}
