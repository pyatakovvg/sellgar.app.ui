import { IsString } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import type { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { UseBindings } from '../../../di/composition/use-bindings';
import { Inject } from '../../../di/injection/decorators';
import type { ModuleExportResolverInterface } from '../../../module/resolution/module-export-resolver';
import type { RouterBridgeInterface } from '../../../router/bridge/router-bridge';
import { Router } from '../../../router/declaration/router';
import { Route } from '../../../router/declaration/route';
import { segments } from '../../../router/declaration/address';
import { ApplicationConfig } from '../../config/application-config';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';
import { Metric, type MetricInterface, type MetricToken } from '../../metric/declaration/metric';
import { MetricEvent } from '../../metric/declaration/metric-event';
import { ApplicationMetricInterface } from '../../metric/service/application-metric';
import { Initializer } from '../../initializer/application-initializer';
import type { ApplicationReport, ApplicationReportHandlerInterface } from '../../reporting/application-report';
import { Reporter } from '../../reporting/reporter';
import { Application } from './application';

@MetricEvent('startup')
class StartupEvent {
  @IsString()
  id!: string;
}

@Initializer()
class StartupInitializer {
  constructor(@Inject(ApplicationMetricInterface) private readonly metric: ApplicationMetricInterface) {}
  execute(): void {
    this.metric.track(StartupEvent, { id: 'initializer' });
  }
}

class Config {
  readonly counterId: number = 123;
}
class ConfigBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(Config).toConstantValue(new Config());
  }
}

class TestApplication extends Application<null> {
  constructor(private readonly metrics: readonly MetricToken[]) {
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
  get metric(): ApplicationMetricInterface {
    return this.getApplicationScope().get(ApplicationMetricInterface);
  }
  protected configure(app: ApplicationConfiguratorInterface): void {
    app.metrics(this.metrics);
    app.initializers([StartupInitializer]);
    app.router(new Router({ routes: [new Route({ address: segments('test'), load: async () => ({}) })] }));
  }
}

describe('Application metric lifecycle', () => {
  it('injects configured dependencies, does not await analytics startup and drains after readiness', async () => {
    let ready!: () => void;
    const pending = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const calls = vi.fn();
    const initialized = vi.fn();
    const cleanup = vi.fn();
    @UseBindings(ConfigBindings)
    @Metric()
    class Adapter implements MetricInterface {
      constructor(@Inject(Config) private readonly config: Config) {}
      initialize() {
        initialized(this.config.counterId);
        return pending;
      }
      track(name: string, payload: object) {
        calls(name, payload);
      }
      dispose() {
        cleanup();
      }
    }
    const app = new TestApplication([Adapter]);
    app.compose();
    await app.initialize();
    expect(app.lifecycle.phase).toBe('ready');
    expect(initialized).toHaveBeenCalledWith(123);
    expect(calls).not.toHaveBeenCalled();
    ready();
    await vi.waitFor(() => expect(calls).toHaveBeenCalledWith('startup', { id: 'initializer' }));
    await app.dispose();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('inherits constructor and property injections in a configured subclass', async () => {
    const initialized = vi.fn();
    @UseBindings(ConfigBindings)
    @Metric()
    class Adapter implements MetricInterface {
      @Inject(Config)
      private readonly propertyConfig!: Config;

      constructor(@Inject(Config) private readonly config: Config) {}
      initialize() {
        initialized(this.config, this.propertyConfig);
      }
      track() {}
    }
    @Metric()
    class ConfiguredAdapter extends Adapter {}
    const app = new TestApplication([ConfiguredAdapter]);
    app.compose();
    await app.initialize();
    expect(initialized).toHaveBeenCalledWith(
      expect.objectContaining({ counterId: 123 }),
      expect.objectContaining({ counterId: 123 }),
    );
    await app.dispose();
  });

  it('uses explicitly injected subclass parameters instead of inherited positions', async () => {
    class OwnConfig {
      readonly counterId = 456;
    }
    class OwnBindings implements BindingModuleInterface {
      register(registry: BindingRegistryInterface): void {
        registry.bind(OwnConfig).toConstantValue(new OwnConfig());
      }
    }
    const initialized = vi.fn();
    @Metric()
    class Adapter implements MetricInterface {
      constructor(@Inject(Config) protected readonly config: Config) {}
      initialize() {
        initialized(this.config.counterId);
      }
      track() {}
    }
    @UseBindings(OwnBindings)
    @Metric()
    class ConfiguredAdapter extends Adapter {
      constructor(@Inject(OwnConfig) config: OwnConfig) {
        super(config);
      }
    }
    const app = new TestApplication([ConfiguredAdapter]);
    app.compose();
    await app.initialize();
    expect(initialized).toHaveBeenCalledWith(456);
    await app.dispose();
  });

  it('allows an explicit zero-argument subclass to opt out of inherited constructor dependencies', async () => {
    const initialized = vi.fn();
    @Metric()
    class Adapter implements MetricInterface {
      constructor(@Inject(Config) protected readonly config: Config) {}
      initialize() {
        initialized(this.config.counterId);
      }
      track() {}
    }
    @Metric({ inheritConstructorArguments: false })
    class ConfiguredAdapter extends Adapter {
      constructor() {
        super(new Config());
      }
    }
    const app = new TestApplication([ConfiguredAdapter]);
    app.compose();
    await app.initialize();
    expect(initialized).toHaveBeenCalledWith(123);
    await app.dispose();
  });

  it('does not resolve unused base parameters when a shorter subclass constructor opts out', async () => {
    class UnusedDependency {}
    const initialized = vi.fn();
    @Metric()
    class Adapter implements MetricInterface {
      constructor(
        @Inject(Config) protected readonly config: Config,
        @Inject(UnusedDependency) _unused: UnusedDependency,
      ) {}
      initialize() {
        initialized(this.config.counterId);
      }
      track() {}
    }
    @UseBindings(ConfigBindings)
    @Metric({ inheritConstructorArguments: false })
    class ConfiguredAdapter extends Adapter {
      constructor(@Inject(Config) config: Config) {
        super(config, new UnusedDependency());
      }
    }
    const app = new TestApplication([ConfiguredAdapter]);
    app.compose();
    await app.initialize();
    expect(initialized).toHaveBeenCalledWith(123);
    await app.dispose();
  });

  it('does not inherit injection requirements from an explicit identity token', async () => {
    const initialized = vi.fn();
    @Metric()
    class Adapter implements MetricInterface {
      constructor(@Inject(Config) private readonly config: Config) {}
      track() {
        return void this.config;
      }
    }
    @Metric({ token: Adapter })
    class ConfiguredAdapter implements MetricInterface {
      initialize() {
        initialized();
      }
      track() {}
    }
    const app = new TestApplication([ConfiguredAdapter]);
    app.compose();
    await app.initialize();
    expect(initialized).toHaveBeenCalledOnce();
    await app.dispose();
  });

  it('contains failed construction/initialization and reports cleanup before reporter disposal', async () => {
    const records: string[] = [];
    @Reporter()
    class TestReporter implements ApplicationReportHandlerInterface {
      report(report: ApplicationReport) {
        records.push(report.event);
      }
      dispose() {
        records.push('reporter.disposed');
      }
    }
    @Metric()
    class BrokenConstructor implements MetricInterface {
      constructor() {
        throw new Error('constructor');
      }
      track() {}
    }
    @Metric()
    class BrokenInitialize implements MetricInterface {
      initialize() {
        throw new Error('initialize');
      }
      track() {}
      dispose() {
        throw new Error('cleanup');
      }
    }
    const app = new TestApplication([BrokenConstructor, BrokenInitialize]);
    app.reporter([TestReporter]);
    expect(() => app.compose()).not.toThrow();
    await app.initialize();
    expect(app.lifecycle.phase).toBe('ready');
    await app.dispose();
    expect(records.filter((item) => item === 'metric.initialize.failed')).toHaveLength(1);
    expect(records).toContain('metric.resolve.failed');
    expect(records).toContain('metric.dispose.failed');
    expect(records.at(-1)).toBe('reporter.disposed');
  });

  it('isolates instances and services between two applications', async () => {
    const instances: Adapter[] = [];
    @Metric()
    class Adapter implements MetricInterface {
      readonly track = vi.fn();
      readonly dispose = vi.fn();
      constructor() {
        instances.push(this);
      }
    }
    const first = new TestApplication([Adapter]);
    const second = new TestApplication([Adapter]);
    first.compose();
    second.compose();
    await Promise.all([first.initialize(), second.initialize()]);
    expect(first.metric).not.toBe(second.metric);
    await vi.waitFor(() => expect(instances[0].track).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(instances[1].track).toHaveBeenCalledTimes(1));
    await first.dispose();
    second.metric.track(StartupEvent, { id: 'second' });
    await vi.waitFor(() => expect(instances[1].track).toHaveBeenCalledTimes(2));
    expect(instances[0].track).toHaveBeenCalledTimes(1);
    expect(instances[0].dispose).toHaveBeenCalledOnce();
    expect(instances[1].dispose).not.toHaveBeenCalled();
    await second.dispose();
  });
});
