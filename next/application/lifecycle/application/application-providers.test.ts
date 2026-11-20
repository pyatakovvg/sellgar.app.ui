import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Inject } from '../../../../core/di/injection/decorators';
import { Provider, type ProviderPrepareContextInterface } from '../../../../core/runtime/provider/provider';
import { WidgetPreloaderInterface } from '../../../../core/widget/service/widget-preloader';
import { WidgetRuntimeRegistry } from '../../../../core/widget/runtime/widget-runtime-registry';
import { Widget, WidgetDefinition } from '../../../../react/widget/declaration/widget';
import type { ApplicationConfiguratorInterface } from '../../config/application-config';
import { Application, getApplicationRuntime, startApplication } from './application';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

test('Next application retains configured components without exposing runtime access on its public facade', async () => {
  const components = { fallback: 'Preparing page' };
  class TestApplication extends Application {
    protected configure(config: ApplicationConfiguratorInterface): void {
      config.components(components);
    }
  }
  const app = await startApplication(() => new TestApplication());
  try {
    const configured = getApplicationRuntime(app).getComponents();
    components.fallback = 'Changed outside configuration';
    assert.equal(configured.fallback, 'Preparing page');
    assert.equal(Object.isFrozen(configured), true);
    assert.equal('getComponents' in app, false);
  } finally {
    await app.dispose();
  }
});

test('Next startup waits for application-provider preload and retains one widget independently of modules', async () => {
  const loading = deferred(),
    entered = deferred();
  let loads = 0,
    disposed = 0;
  @Provider()
  class WidgetProvider {
    async prepare() {
      loads++;
      entered.resolve();
      await loading.promise;
    }
    dispose() {
      disposed++;
    }
  }
  @Widget({ view: () => null, providers: [WidgetProvider] })
  class GlobalWidget extends WidgetDefinition {}
  @Provider()
  class StartupProvider {
    constructor(@Inject(WidgetPreloaderInterface) private readonly widgets: WidgetPreloaderInterface) {}
    prepare(context: ProviderPrepareContextInterface) {
      return this.widgets.preload(context, GlobalWidget);
    }
    dispose() {}
  }
  class TestApplication extends Application {
    protected configure(config: ApplicationConfiguratorInterface): void {
      config.providers([StartupProvider]);
    }
  }
  const app = new TestApplication();
  let ready = false;
  const starting = startApplication(() => app).then((value) => {
    ready = true;
    return value;
  });
  await entered.promise;
  assert.equal(app.lifecycle.phase, 'initializing');
  assert.equal(ready, false);
  loading.resolve();
  await starting;
  const scope = getApplicationRuntime(app).scope;
  const registry = scope.get(WidgetRuntimeRegistry);
  const runtime = registry.get({ ownerScope: scope, token: GlobalWidget });
  assert.equal(runtime?.getSnapshot().phase, 'ready');
  const first = registry.attach({ ownerScope: scope, token: GlobalWidget, props: {} });
  const second = registry.attach({ ownerScope: scope, token: GlobalWidget, props: {} });
  assert.equal(first.runtime, runtime);
  assert.equal(second.runtime, runtime);
  first.release();
  second.release();
  await Promise.resolve();
  assert.equal(runtime?.getSnapshot().phase, 'ready');
  assert.equal(loads, 1);
  await app.dispose();
  assert.equal(disposed, 1);
  assert.equal(runtime?.getSnapshot().phase, 'disposed');
});

test('Next failed startup releases an application provider before disposing the app', async () => {
  let cleaned = 0,
    disposed = 0;
  @Provider()
  class StartupProvider {
    initialize() {
      return () => {
        cleaned++;
      };
    }
    prepare() {
      throw new Error('preload failed');
    }
    dispose() {
      disposed++;
    }
  }
  class TestApplication extends Application {
    protected configure(config: ApplicationConfiguratorInterface): void {
      config.providers([StartupProvider]);
    }
  }
  const app = new TestApplication();
  await assert.rejects(
    startApplication(() => app),
    /preload failed/,
  );
  assert.equal(app.lifecycle.phase, 'disposed');
  assert.equal(cleaned, 1);
  assert.equal(disposed, 1);
});
