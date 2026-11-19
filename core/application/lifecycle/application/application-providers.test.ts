import { describe, expect, it, vi } from 'vitest';

import { Feature } from '../../feature/application-feature';
import { Initializer } from '../../initializer/application-initializer';
import { ApplicationConfig } from '../../config/application-config';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';
import { Inject } from '../../../di/injection/decorators';
import type { ModuleExportResolverInterface } from '../../../module/resolution/module-export-resolver';
import { Router } from '../../../router/declaration/router';
import { Route } from '../../../router/declaration/route';
import { Provider, type ProviderPrepareContextInterface } from '../../../runtime/provider/provider';
import type { ProviderToken } from '../../../runtime/provider/provider-token';
import { WidgetDefinition, configureWidgetRuntimeDefinition } from '../../../widget/declaration/widget';
import { WidgetPreloaderInterface } from '../../../widget/service/widget-preloader';
import { WidgetRuntimeRegistry } from '../../../widget/runtime/widget-runtime-registry';
import { Application } from './application';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

class TestApplication extends Application<null> {
  readonly bridgeStarted = vi.fn();
  constructor(private readonly setup: (config: ApplicationConfiguratorInterface) => void) {
    const initialize = vi.fn();
    super(
      { back() {}, commit() {}, dispose() {}, initialize, runtimeRetention: 'release' },
      new ApplicationConfig(),
      {} as ModuleExportResolverInterface<null>,
    );
    this.bridgeStarted = initialize;
  }
  protected configure(config: ApplicationConfiguratorInterface): void {
    config.router(new Router({ routes: [new Route({ load: async () => ({}) })] }));
    this.setup(config);
  }
  get applicationScope() {
    return this.getApplicationScope();
  }
}

describe('Application providers', () => {
  it('awaits all provider stages after initializers and before features, router and readiness', async () => {
    const events: string[] = [];
    const initialize = deferred(),
      prepare = deferred(),
      activate = deferred();
    @Initializer()
    class SessionInitializer {
      execute() {
        events.push('session');
      }
    }
    @Provider()
    class StartupProvider {
      async initialize() {
        events.push('initialize');
        await initialize.promise;
        return () => {
          events.push('initialize.cleanup');
        };
      }
      async prepare() {
        events.push('prepare');
        await prepare.promise;
        return () => {
          events.push('prepare.cleanup');
        };
      }
      async activate() {
        events.push('activate');
        await activate.promise;
        return () => {
          events.push('activate.cleanup');
        };
      }
      dispose() {
        events.push('dispose');
      }
    }
    @Feature()
    class StartupFeature {
      initialize() {
        events.push('feature');
      }
    }
    const app = new TestApplication((config) => {
      config.initializers([SessionInitializer]);
      config.providers([StartupProvider]);
      config.features([StartupFeature]);
    });
    app.compose();
    const starting = Promise.all([app.initialize(), app.initialize()]);
    for (const [stage, gate] of [
      ['initialize', initialize],
      ['prepare', prepare],
      ['activate', activate],
    ] as const) {
      await vi.waitFor(() => expect(events).toContain(stage));
      expect(app.lifecycle.phase).toBe('initializing');
      expect(events).not.toContain('feature');
      expect(app.bridgeStarted).not.toHaveBeenCalled();
      gate.resolve();
    }
    await starting;
    expect(events).toEqual(['session', 'initialize', 'prepare', 'activate', 'feature']);
    expect(app.lifecycle.phase).toBe('ready');
    expect(app.bridgeStarted).toHaveBeenCalledOnce();
    await app.initialize();
    expect(events).toHaveLength(5);
    await Promise.all([app.dispose(), app.dispose()]);
    expect(events.slice(5)).toEqual(['activate.cleanup', 'prepare.cleanup', 'initialize.cleanup', 'dispose']);
  });

  it('preloads a widget in application scope and retains it until the application is disposed', async () => {
    const loaded = vi.fn(),
      disposed = vi.fn();
    const loading = deferred();
    @Provider()
    class WidgetProvider {
      async prepare() {
        loaded();
        await loading.promise;
      }
      dispose() {
        disposed();
      }
    }
    class GlobalWidget extends WidgetDefinition {}
    configureWidgetRuntimeDefinition(GlobalWidget, { providers: [WidgetProvider] });
    @Provider()
    class StartupProvider {
      constructor(@Inject(WidgetPreloaderInterface) private readonly widgets: WidgetPreloaderInterface) {}
      prepare(context: ProviderPrepareContextInterface) {
        return this.widgets.preload(context, GlobalWidget);
      }
      dispose() {}
    }
    const app = new TestApplication((config) => config.providers([StartupProvider]));
    app.compose();
    const starting = app.initialize();
    await vi.waitFor(() => expect(loaded).toHaveBeenCalledOnce());
    expect(app.lifecycle.phase).toBe('initializing');
    loading.resolve();
    await starting;
    const registry = app.applicationScope.get(WidgetRuntimeRegistry);
    const runtime = registry.get({ ownerScope: app.applicationScope, token: GlobalWidget });
    expect(runtime?.getSnapshot().phase).toBe('ready');
    const host = registry.attach({ ownerScope: app.applicationScope, token: GlobalWidget, props: {} });
    expect(host.runtime).toBe(runtime);
    host.release();
    await Promise.resolve();
    expect(runtime?.getSnapshot().phase).toBe('ready');
    expect(loaded).toHaveBeenCalledOnce();
    await app.dispose();
    expect(disposed).toHaveBeenCalledOnce();
    expect(runtime?.getSnapshot().phase).toBe('disposed');
  });

  it.each(['initialize', 'prepare', 'activate'] as const)(
    'cleans partial startup when provider %s fails',
    async (stage) => {
      const cleaned: string[] = [];
      @Provider()
      class RetainedProvider {
        initialize() {
          return () => {
            cleaned.push('initialize');
          };
        }
        prepare() {
          return () => {
            cleaned.push('prepare');
          };
        }
        activate() {
          return () => {
            cleaned.push('activate');
          };
        }
        dispose() {
          cleaned.push('dispose');
        }
      }
      @Provider()
      class BrokenProvider {
        initialize() {
          if (stage === 'initialize') throw new Error(stage);
        }
        prepare() {
          if (stage === 'prepare') throw new Error(stage);
        }
        activate() {
          if (stage === 'activate') throw new Error(stage);
        }
        dispose() {
          cleaned.push('broken.dispose');
        }
      }
      const app = new TestApplication((config) => config.providers([RetainedProvider, BrokenProvider]));
      app.compose();
      await expect(app.initialize()).rejects.toThrow(stage);
      expect(app.lifecycle.phase).toBe('failed');
      expect(app.bridgeStarted).not.toHaveBeenCalled();
      const stages = ['initialize', 'prepare', 'activate']
        .slice(0, ['initialize', 'prepare', 'activate'].indexOf(stage) + 1)
        .reverse();
      expect(cleaned).toEqual([...stages, 'broken.dispose', 'dispose']);
      await app.dispose();
      expect(cleaned).toEqual([...stages, 'broken.dispose', 'dispose']);
    },
  );

  it('aborts in-flight preparation and awaits its late cleanup before disposing the application scope', async () => {
    const prepared = vi.fn(),
      cleaned = vi.fn(),
      disposed = vi.fn();
    let aborted = false;
    @Provider()
    class StartupProvider {
      async prepare(context: ProviderPrepareContextInterface) {
        prepared();
        await new Promise<void>((resolve) =>
          context.signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              resolve();
            },
            { once: true },
          ),
        );
        return () => {
          expect(app.applicationScope.has(WidgetPreloaderInterface)).toBe(true);
          cleaned();
        };
      }
      dispose() {
        disposed();
      }
    }
    const app = new TestApplication((config) => config.providers([StartupProvider]));
    app.compose();
    const starting = app.initialize();
    await vi.waitFor(() => expect(prepared).toHaveBeenCalledOnce());
    await Promise.all([app.dispose(), starting]);
    expect(aborted).toBe(true);
    expect(app.lifecycle.phase).toBe('disposed');
    expect(app.bridgeStarted).not.toHaveBeenCalled();
    expect(cleaned).toHaveBeenCalledOnce();
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('releases committed provider activity if a following feature fails', async () => {
    const cleaned = vi.fn(),
      disposed = vi.fn();
    @Provider()
    class StartupProvider {
      activate() {
        return cleaned;
      }
      dispose() {
        disposed();
      }
    }
    @Feature()
    class BrokenFeature {
      initialize() {
        throw new Error('feature failed');
      }
    }
    const app = new TestApplication((config) => {
      config.providers([StartupProvider]);
      config.features([BrokenFeature]);
    });
    app.compose();
    await expect(app.initialize()).rejects.toThrow('feature failed');
    expect(app.lifecycle.phase).toBe('failed');
    expect(cleaned).toHaveBeenCalledOnce();
    expect(disposed).toHaveBeenCalledOnce();
    await app.dispose();
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('rolls back providers if the router bridge fails after preparation', async () => {
    const cleaned = vi.fn(),
      disposed = vi.fn();
    @Provider()
    class StartupProvider {
      activate() {
        return cleaned;
      }
      dispose() {
        disposed();
      }
    }
    const app = new TestApplication((config) => config.providers([StartupProvider]));
    app.bridgeStarted.mockRejectedValueOnce(new Error('bridge failed'));
    app.compose();
    await expect(app.initialize()).rejects.toThrow('bridge failed');
    expect(app.lifecycle.phase).toBe('failed');
    expect(cleaned).toHaveBeenCalledOnce();
    expect(disposed).toHaveBeenCalledOnce();
    await app.dispose();
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('isolates provider instances between applications and keeps application lifetime leases until shutdown', async () => {
    let instances = 0;
    const cleaned = vi.fn(),
      disposed = vi.fn();
    @Provider({ lifetime: 'application' })
    class StartupProvider {
      constructor() {
        instances++;
      }
      activate() {
        return cleaned;
      }
      dispose() {
        disposed();
      }
    }
    const providers: ProviderToken[] = [StartupProvider];
    const first = new TestApplication((config) => config.providers(providers));
    const second = new TestApplication((config) => config.providers(providers));
    first.compose();
    second.compose();
    await Promise.all([first.initialize(), second.initialize()]);
    expect(instances).toBe(2);
    expect(cleaned).not.toHaveBeenCalled();
    await first.dispose();
    expect(second.lifecycle.phase).toBe('ready');
    expect(cleaned).toHaveBeenCalledOnce();
    expect(disposed).toHaveBeenCalledOnce();
    await second.dispose();
    expect(cleaned).toHaveBeenCalledTimes(2);
    expect(disposed).toHaveBeenCalledTimes(2);
  });
});
