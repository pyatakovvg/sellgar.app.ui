import { describe, expect, it, vi } from 'vitest';
import { Controller, type ControllerArgs, type WithPayload } from '../../../controller/contract/controller';
import { UseBindings } from '../../../di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { ApplicationScope } from '../../../runtime/scope/kind/application-scope';
import { SessionRuntimeState } from '../../session/session-runtime-state';
import { Feature, type ApplicationFeatureInterface } from '../application-feature';
import { ApplicationFeaturesRuntime } from './application-features-runtime';

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const fixture = (options: { load?: () => Promise<void>; action?: (signal: AbortSignal) => Promise<void> } = {}) => {
  const events: string[] = [];
  let value = 0;
  @Controller()
  class Counter {
    async loader() {
      events.push('loader');
      await options.load?.();
      return value;
    }
    async action(args: ControllerArgs<WithPayload<number>>) {
      events.push('action');
      await options.action?.(args.signal);
      value += args.payload;
      return value;
    }
    increment() {
      value++;
    }
    dispose() {
      events.push('controller.dispose');
    }
  }
  class Bindings {
    register(registry: BindingRegistryInterface) {
      registry.bind(Counter).toSelf().inSingletonScope();
    }
  }
  @UseBindings(Bindings)
  @Feature()
  class TestFeature implements ApplicationFeatureInterface {
    initialize() {
      events.push('feature.initialize');
      return () => {
        events.push('feature.initialize.cleanup');
      };
    }
    dispose() {
      events.push('feature.dispose');
    }
  }
  const scope = new ApplicationScope();
  scope.bindSession(new SessionRuntimeState());
  const features = scope.activateFeatures([TestFeature]);
  const runtime = new ApplicationFeaturesRuntime(scope, [TestFeature], features);
  const dispose = async () => {
    await runtime.dispose();
    await scope.disposeProviders();
    scope.dispose();
  };
  return { runtime, scope, events, Counter, dispose };
};

describe('application feature controller lifecycle', () => {
  it('rejects classes that do not declare the feature role', () => {
    class UndeclaredFeature implements ApplicationFeatureInterface {}

    const scope = new ApplicationScope();
    scope.bindSession(new SessionRuntimeState());

    expect(() => scope.activateFeatures([UndeclaredFeature])).toThrow(
      'Feature class must be decorated with @Feature().',
    );

    scope.dispose();
  });

  it('rejects duplicate feature declarations', () => {
    @Feature()
    class DuplicateFeature implements ApplicationFeatureInterface {}

    const scope = new ApplicationScope();
    scope.bindSession(new SessionRuntimeState());

    expect(() => scope.activateFeatures([DuplicateFeature, DuplicateFeature])).toThrow(
      'Feature DuplicateFeature is registered more than once.',
    );

    scope.dispose();
  });

  it('cleans up initialized features when another feature fails to initialize', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const events: string[] = [];
    const error = new Error('feature failed');

    @Feature()
    class ReadyFeature implements ApplicationFeatureInterface {
      initialize() {
        events.push('ready.initialize');
        return () => {
          events.push('ready.cleanup');
        };
      }

      dispose() {
        events.push('ready.dispose');
      }
    }

    @Feature()
    class FailedFeature implements ApplicationFeatureInterface {
      initialize() {
        events.push('failed.initialize');
        throw error;
      }

      dispose() {
        events.push('failed.dispose');
      }
    }

    const scope = new ApplicationScope();
    scope.bindSession(new SessionRuntimeState());
    const tokens = [ReadyFeature, FailedFeature] as const;
    const features = scope.activateFeatures(tokens);
    const runtime = new ApplicationFeaturesRuntime(scope, tokens, features);

    try {
      await expect(runtime.load()).rejects.toBe(error);
      expect(events).toEqual([
        'ready.initialize',
        'failed.initialize',
        'ready.cleanup',
        'failed.dispose',
        'ready.dispose',
      ]);

      await runtime.dispose();
      expect(events.filter((event) => event.endsWith('dispose'))).toHaveLength(2);
    } finally {
      await scope.disposeProviders();
      scope.dispose();
      vi.restoreAllMocks();
    }
  });

  it('shares preparation and executes loader, action, invocation and revalidation through the existing executor', async () => {
    const gate = deferred();
    const f = fixture({ load: () => gate.promise });
    const first = f.runtime.load();
    const second = f.runtime.load();
    expect(first).toBe(second);
    expect(f.runtime.getSnapshot().phase).toBe('idle');
    gate.resolve();
    await first;
    expect(f.events).toEqual(['feature.initialize', 'loader']);
    expect(f.runtime.getSnapshot().phase).toBe('ready');
    expect(f.runtime.getController(f.Counter)).toBe(f.scope.get(f.Counter));
    expect(f.runtime.getLoaderData(f.Counter)).toBe(0);
    expect(await f.runtime.action(f.Counter, 2)).toBe(2);
    f.runtime.invoke(f.Counter, 'increment', []);
    await f.runtime.revalidate({ controllerToken: f.Counter });
    expect(f.runtime.getLoaderData(f.Counter)).toBe(3);
    expect(f.events.filter((event) => event === 'feature.initialize')).toHaveLength(1);
    await f.dispose();
    expect(f.events).toContain('feature.initialize.cleanup');
    expect(f.events.filter((event) => event === 'feature.dispose')).toHaveLength(1);
    expect(f.events.filter((event) => event === 'controller.dispose')).toHaveLength(1);
    await f.runtime.dispose();
    expect(f.events.filter((event) => event === 'controller.dispose')).toHaveLength(1);
  });

  it('contains action errors without failing the feature runtime', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('command failed');
    const f = fixture({
      action: async () => {
        throw error;
      },
    });
    try {
      await f.runtime.load();
      expect(await f.runtime.action(f.Counter, 1)).toBeUndefined();
      expect(f.runtime.getActionState(f.Counter)).toMatchObject({ error, inProcess: false });
      expect(f.runtime.getSnapshot().phase).toBe('ready');
    } finally {
      await f.dispose();
      vi.restoreAllMocks();
    }
  });

  it('cleans up partial preparation after a loader failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('load failed');
    const f = fixture({
      load: async () => {
        throw error;
      },
    });
    try {
      await expect(f.runtime.load()).rejects.toBe(error);
      expect(f.runtime.getSnapshot().phase).toBe('failed');
      expect(f.events).toContain('feature.initialize.cleanup');
      expect(f.events).toContain('feature.dispose');
    } finally {
      await f.dispose();
      vi.restoreAllMocks();
    }
    expect(f.events.filter((event) => event === 'controller.dispose')).toHaveLength(1);
  });

  it('does not publish late loader results after dispose', async () => {
    const gate = deferred();
    const f = fixture({ load: () => gate.promise });
    const load = f.runtime.load();
    await vi.waitFor(() => expect(f.events).toContain('loader'));
    const dispose = f.dispose();
    expect(f.runtime.getSnapshot().phase).toBe('disposing');
    gate.resolve();
    await Promise.all([load, dispose]);
    expect(f.runtime.getSnapshot().phase).toBe('disposed');
    expect(f.events.filter((event) => event === 'controller.dispose')).toHaveLength(1);
  });

  it('aborts an in-flight action before disposing its controller', async () => {
    const f = fixture({
      action: (signal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true });
        }),
    });
    await f.runtime.load();
    const action = f.runtime.action(f.Counter, 1);
    await vi.waitFor(() => expect(f.runtime.getActionState(f.Counter).inProcess).toBe(true));
    await f.dispose();
    expect(await action).toBeUndefined();
    expect(f.events.filter((event) => event === 'controller.dispose')).toHaveLength(1);
  });
});
