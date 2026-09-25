import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { ApplicationReport, ApplicationReportHandlerInterface } from '../../reporting/application-report';
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

  initialize(): void {
    TestReporter.initialize(this.config);
  }

  report(report: ApplicationReport): void {
    TestReporter.report(report);
  }
}

class TestApplication extends Application<null> {
  constructor() {
    super(
      {
        back: () => undefined,
        commit: () => undefined,
        dispose: () => undefined,
        initialize: () => undefined,
        runtimeRetention: 'release',
      } satisfies RouterBridgeInterface,
      new ApplicationConfig(),
      {} as ModuleExportResolverInterface<null>,
    );
  }

  protected configure(app: ApplicationConfiguratorInterface): void {
    app.router(
      new Router({
        routes: [new Route({ address: segments('test'), load: async () => ({}) })],
      }),
    );
  }
}

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
    expect(TestReporter.initialize).toHaveBeenCalledWith(expect.any(TestRuntimeConfig));

    await app.failRender(failure);

    expect(TestReporter.report).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'application.failed',
        failure: expect.objectContaining({ cause: failure }),
      }),
    );

    await app.dispose();
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
