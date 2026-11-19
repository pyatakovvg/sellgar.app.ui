import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BindingModuleInterface } from '../../../di/binding/binding-module';
import {
  ApplicationReporterInterface,
  type ApplicationReport,
  type ApplicationReportHandlerInterface,
} from '../../reporting/application-report';
import type { RuntimeContextInterface } from '../../../runtime/context/runtime-context';
import { LocationServiceInterface } from '../../../router/service/location-service';
import type { RouterBridgeInitializeContextInterface } from '../../../router/bridge/router-bridge';
import { RouteScope } from '../../../runtime/scope/kind/route-scope';
import { createModuleRuntimeDefinition } from '../../../module/contract/module-runtime-definition';
import { Reporter } from '../../reporting/reporter';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { UseBindings } from '../../../di/composition/use-bindings';
import { Inject } from '../../../di/injection/decorators';
import type { ModuleExportResolverInterface } from '../../../module/resolution/module-export-resolver';
import type { RouterBridgeInterface } from '../../../router/bridge/router-bridge';
import { segments } from '../../../router/declaration/address';
import { Route } from '../../../router/declaration/route';
import { Router } from '../../../router/declaration/router';
import { ApplicationConfig } from '../../config/application-config';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';

import { Application } from './application.ts';

class TestRuntimeConfig {
  readonly endpoint = 'https://example.test';
}

class TestBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(TestRuntimeConfig).toConstantValue(new TestRuntimeConfig());
  }
}

@UseBindings(TestBindings)
@Reporter()
class TestReporter implements ApplicationReportHandlerInterface {
  static initialize = vi.fn();
  static report = vi.fn();

  constructor(
    @Inject(TestRuntimeConfig)
    private readonly config: TestRuntimeConfig,
  ) {}

  initialize(context: RuntimeContextInterface): void | Promise<void> {
    return TestReporter.initialize(this.config, context);
  }

  report(report: ApplicationReport, context: RuntimeContextInterface): void {
    TestReporter.report(report, context);
  }
}

class TestModule {}

class TestApplication extends Application<null> {
  constructor(
    bridge: RouterBridgeInterface = {
      back: () => undefined,
      commit: () => undefined,
      dispose: () => undefined,
      initialize: () => undefined,
      runtimeRetention: 'release',
    },
  ) {
    super(bridge, new ApplicationConfig(), {
      resolve: () => createModuleRuntimeDefinition({ token: TestModule, presentation: null }),
    } satisfies ModuleExportResolverInterface<null>);
  }

  get scope() {
    return this.getApplicationScope();
  }

  protected configure(app: ApplicationConfiguratorInterface): void {
    app.router(
      new Router({
        routes: [new Route({ address: segments('test'), load: async () => ({}) })],
      }),
    );
  }
}

const createBridge = (initialState: unknown) => {
  let context: RouterBridgeInitializeContextInterface;
  const publish = (state: unknown) =>
    context.restore(
      {
        address: ['test'],
        nested: null,
        query: {},
        revalidate: true,
        state,
      },
      { blockersConfirmed: true },
    );
  const bridge: RouterBridgeInterface = {
    runtimeRetention: 'release',
    back: () => undefined,
    commit: () => undefined,
    dispose: () => undefined,
    initialize: async (value) => {
      context = value;
      await publish(initialState);
    },
  };
  return { bridge, publish };
};

describe('Application reporters', () => {
  beforeEach(() => {
    TestReporter.initialize.mockReset();
    TestReporter.report.mockReset();
  });

  it('initializes configured reporters with application dependencies during compose', async () => {
    const app = new TestApplication();
    const failure = new Error('Render failed');

    app.reporter([TestReporter]);
    app.compose();
    await app.initialize();

    expect(TestReporter.initialize).toHaveBeenCalledOnce();
    const context = TestReporter.initialize.mock.calls[0]![1] as RuntimeContextInterface;
    expect(TestReporter.initialize).toHaveBeenCalledWith(expect.any(TestRuntimeConfig), context);
    expect(context.app).toBe(app);
    expect(context.app.location).toBeNull();
    expect(context.signal.aborted).toBe(false);

    await app.failRender(failure);

    expect(TestReporter.report).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'application.failed',
        failure: expect.objectContaining({ cause: failure }),
      }),
      context,
    );

    await app.dispose();
    expect(context.signal.aborted).toBe(true);
  });

  it('exposes current root location and changes without leaking route-local state', async () => {
    const first = { selected: 'first' };
    const second = { selected: 'second' };
    const source = createBridge(first);
    const app = new TestApplication(source.bridge);
    app.reporter([TestReporter]);
    app.compose();
    await app.initialize();
    const context = TestReporter.initialize.mock.calls[0]![1] as RuntimeContextInterface;
    const listener = vi.fn();
    const unsubscribe = context.app.subscribeLocation(listener);
    const child = new RouteScope(app.scope, (registry) => {
      registry.bind(LocationServiceInterface).toConstantValue({
        location: { params: {}, state: { selected: 'staged' } },
        paramsToObject: vi.fn(),
        subscribe: vi.fn(() => () => undefined),
      });
    });
    try {
      const previousLocation = context.app.location;
      expect(previousLocation?.state).toBe(first);
      expect(child.get(LocationServiceInterface).location?.state).toEqual({ selected: 'staged' });
      await source.publish(second);
      expect(context.app.location?.state).toBe(second);
      expect(previousLocation?.state).toBe(first);
      expect(listener).toHaveBeenCalledExactlyOnceWith(context.app.location);
      app.scope.get(ApplicationReporterInterface).info({ event: 'location.changed' });
      await vi.waitFor(() =>
        expect(TestReporter.report).toHaveBeenCalledWith(
          expect.objectContaining({ event: 'location.changed' }),
          context,
        ),
      );
      unsubscribe();
      await source.publish(undefined);
      expect(context.app.location?.state).toBeUndefined();
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
      child.dispose();
      await app.dispose();
    }
  });

  it('keeps reporter contexts and location subscriptions isolated between applications', async () => {
    const firstSource = createBridge({ name: 'first' });
    const secondSource = createBridge({ name: 'second' });
    const first = new TestApplication(firstSource.bridge);
    const second = new TestApplication(secondSource.bridge);
    first.reporter([TestReporter]);
    second.reporter([TestReporter]);
    first.compose();
    second.compose();
    await Promise.all([first.initialize(), second.initialize()]);
    const contexts = TestReporter.initialize.mock.calls.map((call) => call[1] as RuntimeContextInterface);
    expect(contexts.map((context) => context.app)).toEqual([first, second]);
    const listener = vi.fn();
    const unsubscribe = second.subscribeLocation(listener);
    try {
      await firstSource.publish({ name: 'updated' });
      expect(first.location?.state).toEqual({ name: 'updated' });
      expect(second.location?.state).toEqual({ name: 'second' });
      expect(listener).not.toHaveBeenCalled();
      expect(contexts[0]!.signal).not.toBe(contexts[1]!.signal);
    } finally {
      unsubscribe();
      await Promise.all([first.dispose(), second.dispose()]);
    }
  });

  it('delivers early reports with the application context after reporter initialization', async () => {
    const fallback = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const gate = Promise.withResolvers<void>();
    TestReporter.initialize.mockReturnValueOnce(gate.promise);
    const app = new TestApplication();
    app.reporter([TestReporter]);
    app.compose();
    app.scope.get(ApplicationReporterInterface).info({ event: 'early.report' });
    const initialization = app.initialize();
    try {
      await vi.waitFor(() => expect(TestReporter.initialize).toHaveBeenCalledOnce());
      expect(TestReporter.report).not.toHaveBeenCalled();
      gate.resolve();
      await initialization;
      const context = TestReporter.initialize.mock.calls[0]![1] as RuntimeContextInterface;
      await vi.waitFor(() =>
        expect(TestReporter.report).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ event: 'early.report' }),
          context,
        ),
      );
      expect(context.app).toBe(app);
      expect(fallback).toHaveBeenCalledOnce();
    } finally {
      gate.resolve();
      await initialization;
      await app.dispose();
      fallback.mockRestore();
    }
  });

  it('contains initialization failures and delivers cleanup reports with a readable context', async () => {
    const fallback = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failedReport = vi.fn();
    @Reporter()
    class FailedReporter implements ApplicationReportHandlerInterface {
      initialize(): void {
        throw new Error('Initialization failed');
      }
      report = failedReport;
    }
    const source = createBridge({ value: 'current' });
    const app = new TestApplication(source.bridge);
    app.reporter([FailedReporter, TestReporter]);
    app.compose();
    await app.initialize();
    const context = TestReporter.initialize.mock.calls[0]![1] as RuntimeContextInterface;
    const failure = new Error('Bridge cleanup failed');
    source.bridge.dispose = () => {
      throw failure;
    };
    try {
      await app.dispose();
      expect(failedReport).not.toHaveBeenCalled();
      expect(TestReporter.report).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'runtime.failure',
          failure: expect.objectContaining({ cause: failure }),
        }),
        context,
      );
      expect(context.signal.aborted).toBe(true);
      expect(context.app.location?.state).toEqual({ value: 'current' });
      expect(fallback).toHaveBeenCalledWith(expect.objectContaining({ operation: 'initialize' }));
    } finally {
      await app.dispose();
      fallback.mockRestore();
    }
  });

  it('rejects a reporter without the reporter declaration', () => {
    class UndeclaredReporter implements ApplicationReportHandlerInterface {
      report(): void {}
    }

    const app = new TestApplication();

    app.reporter([UndeclaredReporter]);

    expect(() => app.compose()).toThrow('Reporter class must be decorated with @Reporter().');
  });
});
