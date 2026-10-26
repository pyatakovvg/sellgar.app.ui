import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Controller } from '../../../../core/controller/contract/controller';
import { Injectable, Inject } from '../../../../core/di/injection/decorators';
import { UseBindings } from '../../../../core/di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../../core/di/binding/binding-registry';
import { Module } from '../../../../react/module/declaration/module';
import { Provider } from '../../../../core/runtime/provider/provider';
import { Application, startApplication } from '../../../application/lifecycle/application';
import { ClientModule } from '../client-module';
import { captureModuleSnapshot, createModuleRuntime, hydrateModuleSession } from './module-session';

function fixture(hanging = false) {
  const calls = { loaders: 0, disposed: 0 };
  const events: string[] = [];
  abstract class CounterToken {
    abstract increment(): number;
  }
  abstract class ControllerToken {
    abstract loader(args: { readonly signal: AbortSignal }): Promise<{ initial: number }>;
    abstract increment(): number;
  }
  @Injectable()
  class Counter extends CounterToken {
    #value = 0;
    increment() {
      return ++this.#value;
    }
  }
  @Controller()
  class TestController extends ControllerToken {
    #private = 1;
    constructor(@Inject(CounterToken) private readonly counter: CounterToken) {
      super();
    }
    async loader(args: { readonly signal: AbortSignal }) {
      events.push('loader');
      calls.loaders++;
      if (hanging)
        await new Promise((_resolve, reject) => {
          args.signal.addEventListener('abort', () => reject(new Error('loader aborted')), { once: true });
        });
      return { initial: this.#private };
    }
    increment() {
      return this.counter.increment();
    }
    dispose() {
      events.push('controller.dispose');
      calls.disposed++;
    }
  }
  class Bindings {
    register(registry: BindingRegistryInterface) {
      registry.bind(CounterToken).to(Counter).inSingletonScope();
      registry.bind(ControllerToken).to(TestController).inSingletonScope();
    }
  }
  @Provider()
  class TestProvider {
    initialize() {
      events.push('initialize');
      return () => {
        events.push('initialize.cleanup');
      };
    }
    prepare() {
      events.push('prepare');
      return () => {
        events.push('prepare.cleanup');
      };
    }
    activate() {
      events.push('activate');
      return () => {
        events.push('activate.cleanup');
      };
    }
    dispose() {
      events.push('provider.dispose');
    }
  }
  @UseBindings(Bindings)
  @Module({ view: () => null, providers: [TestProvider] })
  class TestModule {}
  return { calls, events, token: ControllerToken, exports: { TestModule } };
}

async function serverSnapshot(value: ReturnType<typeof fixture>) {
  const app = await startApplication(() => new Application());
  const session = createModuleRuntime(app, async () => value.exports, 'test-render');
  const params = { id: '42' };
  const props = { searchParams: { page: '2' } };
  await session.runtime.load({ params, props, signal: new AbortController().signal });
  session.runtime.commit();
  const snapshot = captureModuleSnapshot(session.runtime, { id: 'test-render', params, props });
  return { app, session, snapshot };
}

test('server load uses module bindings and transports data without tokens or instances', async () => {
  const value = fixture();
  const { app, session, snapshot } = await serverSnapshot(value);
  assert.equal(value.calls.loaders, 1);
  assert.equal(session.runtime.invoke(value.token, 'increment', []), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)).controllers[0].data, { initial: 1 });
  assert.equal(snapshot.params.id, '42');
  await app.dispose();
  await session.dispose();
  assert.equal(value.calls.disposed, 1);
});

test('hydration replays loader data once, keeps core lifecycle and private controller fields, then revalidates normally', async () => {
  const value = fixture();
  const { app, snapshot } = await serverSnapshot(value);
  const browser = await startApplication(() => new Application());
  const session = createModuleRuntime(browser, async () => value.exports, snapshot.id);
  await hydrateModuleSession(session, snapshot, new AbortController().signal);
  assert.equal(value.calls.loaders, 1);
  assert.deepEqual(session.runtime.getLoaderData(value.token), { initial: 1 });
  assert.equal(session.runtime.invoke(value.token, 'increment', []), 1);
  await session.runtime.revalidate();
  assert.equal(value.calls.loaders, 2);
  await Promise.all([app.dispose(), browser.dispose()]);
  assert.equal(value.calls.disposed, 2);
});

test('StrictMode effect replay keeps one module alive and the final lease releases it exactly once', async () => {
  const value = fixture();
  const { app, snapshot } = await serverSnapshot(value);
  const browser = await startApplication(() => new Application());
  const client = new ClientModule(value.exports, snapshot);
  assert.deepEqual(client.getLoaderData(value.token), { initial: 1 });
  assert.throws(() => client.invoke(value.token, 'increment', []), /не готов/);
  const first = client.acquire(browser);
  first.release();
  const second = client.acquire(browser);
  assert.equal(first.ready, second.ready);
  await second.ready;
  assert.equal(client.invoke(value.token, 'increment', []), 1);
  assert.equal(value.calls.loaders, 1);
  second.release();
  second.release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(value.calls.disposed, 1);
  await Promise.all([app.dispose(), browser.dispose()]);
  assert.equal(value.calls.disposed, 2);
});

test('failed hydration releases its scope and rejects different server/client controller bindings', async () => {
  const value = fixture();
  const { app, snapshot } = await serverSnapshot(value);
  const browser = await startApplication(() => new Application());
  const session = createModuleRuntime(browser, async () => value.exports, snapshot.id);
  await assert.rejects(
    hydrateModuleSession(session, { ...snapshot, controllers: [] }, new AbortController().signal),
    /различаются/,
  );
  await session.dispose();
  assert.equal(value.calls.disposed, 1);
  await Promise.all([app.dispose(), browser.dispose()]);
  assert.equal(value.calls.disposed, 2);
});

test('provider hooks keep core ordering and every cleanup runs before the application scope is disposed', async () => {
  const value = fixture();
  const { app } = await serverSnapshot(value);
  for (const hook of ['loader', 'prepare', 'activate']) assert.ok(value.events.includes(hook));
  assert.ok(value.events.indexOf('initialize') < value.events.indexOf('loader'));
  assert.ok(value.events.indexOf('prepare') < value.events.indexOf('activate'));
  await app.dispose();
  for (const hook of [
    'initialize.cleanup',
    'prepare.cleanup',
    'activate.cleanup',
    'provider.dispose',
    'controller.dispose',
  ]) {
    assert.equal(value.events.filter((event) => event === hook).length, 1, hook);
  }
  assert.ok(value.events.indexOf('controller.dispose') < value.events.indexOf('provider.dispose'));
  assert.equal(app.lifecycle.phase, 'disposed');
});

test('application disposal is idempotent and prevents reentrant module activation during cleanup', async () => {
  const app = await startApplication(() => new Application());
  let cleaned = 0;
  app.retainModule({
    async dispose() {
      assert.equal(app.lifecycle.phase, 'ready');
      assert.throws(() => app.retainModule({ dispose: async () => {} }), /освобождении/);
      cleaned++;
    },
  });
  const first = app.dispose();
  assert.equal(first, app.dispose());
  await first;
  assert.equal(cleaned, 1);
  assert.equal(app.lifecycle.phase, 'disposed');
});

test('application disposal aborts an outstanding module load and releases its controller', async () => {
  const value = fixture(true);
  const app = await startApplication(() => new Application());
  const session = createModuleRuntime(app, async () => value.exports, 'aborted-render');
  const loading = session.runtime.load({ params: {}, props: {}, signal: session.abort.signal });
  const rejected = assert.rejects(loading, /aborted|прервана/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(value.calls.loaders, 1);
  await app.dispose();
  await rejected;
  assert.equal(session.abort.signal.aborted, true);
  assert.equal(value.calls.disposed, 1);
});
