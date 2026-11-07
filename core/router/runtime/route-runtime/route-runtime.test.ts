import { afterEach, describe, expect, it, vi } from 'vitest';

import { createModuleRuntimeDefinition } from '../../../module/contract/module-runtime-definition';
import type { ModuleExportResolverInterface } from '../../../module/resolution/module-export-resolver';
import { ApplicationScope } from '../../../runtime/scope/kind/application-scope';
import { Route } from '../../declaration/route';

import { RouteRuntime } from './route-runtime.ts';

class TestModule {}

const exportResolver: ModuleExportResolverInterface<null> = {
  resolve: () => createModuleRuntimeDefinition({ presentation: null, token: TestModule }),
};

describe('RouteRuntime activation reuse', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    vi.restoreAllMocks();
  });

  const createRuntime = (module = false): RouteRuntime<null> => {
    const scope = new ApplicationScope();
    const moduleOptions = { load: async () => ({ module: TestModule }) };
    const route = new Route(module ? moduleOptions : { routes: [new Route(moduleOptions)] });
    const runtime = new RouteRuntime(route, scope, exportResolver, 'route:0');
    cleanups.push(async () => {
      await runtime.dispose();
      await scope.disposeProviders();
      scope.dispose();
    });
    return runtime;
  };

  it.each([false, true])('reuses active and retained prepared activations (module: %s)', async (module) => {
    const runtime = createRuntime(module);
    const { activation } = runtime.acquire({ id: 'one' });
    await activation.prepare({ params: { id: 'one' }, signal: new AbortController().signal });
    activation.commit();

    expect(runtime.acquire({ id: 'one' })).toEqual({ activation, created: false });
    expect(activation.isReusableForNavigation()).toBe(true);

    await activation.retain();

    expect(runtime.acquire({ id: 'one' })).toEqual({ activation, created: false });
    expect(activation.isReusableForNavigation()).toBe(false);
    expect(runtime.acquire({ id: 'two' }).activation).not.toBe(activation);
    expect(runtime.acquire({ id: 'one' }, { reuse: false }).activation).not.toBe(activation);
  });

  it.each(['forbidden', 'not-found', 'failed'] as const)(
    'allocates a fresh activation without changing a referenced %s boundary',
    async (phase) => {
      const runtime = createRuntime();
      const { activation } = runtime.acquire({ id: 'one' });
      const exception = phase === 'failed' ? activation.createBoundaryException(new Error('Denied'), 'policy') : null;
      activation.commitBoundary(phase, exception, { id: 'one' });
      runtime.retain(activation);
      const snapshot = activation.getSnapshot();

      const next = runtime.acquire({ id: 'one' });

      expect(next.created).toBe(true);
      expect(next.activation).not.toBe(activation);
      expect(next.activation.getSnapshot().phase).toBe('empty');
      expect(activation.getSnapshot()).toBe(snapshot);
      expect(runtime.hasReferences(activation)).toBe(true);
      await runtime.discard(next.activation);
      expect(activation.getSnapshot()).toBe(snapshot);
      await runtime.release(activation);
    },
  );

  it('does not borrow an allocation before its preparation is committed', async () => {
    const runtime = createRuntime();
    const { activation } = runtime.acquire({});
    expect(runtime.acquire({}).activation).not.toBe(activation);

    await activation.prepare({ params: {}, signal: new AbortController().signal });

    expect(activation.getSnapshot().phase).toBe('pending');
    expect(runtime.acquire({}).activation).not.toBe(activation);
  });

  it('does not reuse an active activation behind a refresh boundary', async () => {
    const runtime = createRuntime();
    const { activation } = runtime.acquire({});
    await activation.prepare({ params: {}, signal: new AbortController().signal });
    activation.commit();
    activation.setRefreshBoundary('forbidden', null);

    expect(runtime.acquire({}).activation).not.toBe(activation);

    activation.clearRefreshBoundary();
    expect(runtime.acquire({})).toEqual({ activation, created: false });
  });

  it('does not reuse an active route whose module failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const runtime = createRuntime(true);
    const { activation } = runtime.acquire({});
    await activation.prepare({ params: {}, signal: new AbortController().signal });
    activation.commit();
    await activation.getModuleRuntime().failRender(new Error('Module render failed'));

    expect(activation.getSnapshot().phase).toBe('active');
    expect(activation.getModuleRuntime().getSnapshot().phase).toBe('failed');
    expect(runtime.acquire({}).activation).not.toBe(activation);
  });
});
