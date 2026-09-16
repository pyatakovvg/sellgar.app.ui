import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionRuntimeState } from '../../../application/session/session-runtime-state';
import { ApplicationScope } from '../../../runtime/scope/kind/application-scope';
import { WidgetDefinition, configureWidgetRuntimeDefinition } from '../../declaration/widget';
import { WidgetRuntimeRegistry } from './widget-runtime-registry.ts';
import type { WidgetRuntimePresentation } from './widget-runtime-registry.ts';

describe('WidgetRuntimeRegistry', () => {
  let registry: WidgetRuntimeRegistry;

  beforeEach(() => {
    registry = new WidgetRuntimeRegistry();
  });

  afterEach(async () => {
    await registry.dispose();
  });

  it('uses owner scope, widget token and runtime key as identity', () => {
    const firstOwner = createOwnerScope();
    const secondOwner = createOwnerScope();
    const first = acquire(registry, firstOwner, 'first');
    const shared = acquire(registry, firstOwner, 'shared');
    const keyed = acquire(registry, firstOwner, 'keyed', 'other');
    const otherOwner = acquire(registry, secondOwner, 'other-owner');
    const otherToken = registry.acquire({
      ownerScope: firstOwner,
      props: { value: 'other-token' },
      token: OtherRegistryWidget,
    });

    expect(shared.runtime).toBe(first.runtime);
    expect(first.runtime.getProps()).toEqual({ value: 'shared' });
    expect(keyed.runtime).not.toBe(first.runtime);
    expect(otherOwner.runtime).not.toBe(first.runtime);
    expect(otherToken.runtime).not.toBe(first.runtime);

    first.release();
    shared.release();
    keyed.release();
    otherOwner.release();
    otherToken.release();
  });

  it('keeps a shared runtime until the last lease is released', async () => {
    const owner = createOwnerScope();
    const first = acquire(registry, owner, 'first');
    const second = acquire(registry, owner, 'second');

    await first.runtime.load();
    first.release();
    await flushMicrotasks();

    expect(second.runtime.getSnapshot().phase).toBe('ready');

    second.release();
    await waitFor(() => second.runtime.getSnapshot().phase === 'disposed');

    expect(second.runtime.getSnapshot().phase).toBe('disposed');
    expect(registry.get({ ownerScope: owner, token: RegistryWidget })).toBeNull();
  });

  it('reuses a runtime when a StrictMode replay reacquires before deferred cleanup', async () => {
    const owner = createOwnerScope();
    const first = acquire(registry, owner, 'first');

    await first.runtime.load();
    first.release();

    const replay = acquire(registry, owner, 'replayed');

    await flushMicrotasks();

    expect(replay.runtime).toBe(first.runtime);
    expect(replay.runtime.getSnapshot().phase).toBe('ready');

    replay.release();
  });

  it('preserves the widget runtime while its owner is retained and reuses it on focus', async () => {
    const owner = createOwnerScope();
    const first = acquire(registry, owner, 'first');

    await first.runtime.load();
    registry.retainOwner(owner);
    first.release();
    await flushMicrotasks();

    expect(first.runtime.getSnapshot().phase).toBe('ready');
    expect(registry.get({ ownerScope: owner, token: RegistryWidget })).toBe(first.runtime);

    registry.focusOwner(owner);
    const returned = acquire(registry, owner, 'returned');

    expect(returned.runtime).toBe(first.runtime);
    returned.release();
    await waitFor(() => first.runtime.getSnapshot().phase === 'disposed');
  });

  it('disposes child runtimes when their owner scope is disposed', async () => {
    const owner = createOwnerScope();
    const lease = acquire(registry, owner, 'owned');

    await lease.runtime.load();
    owner.dispose();
    await waitFor(() => lease.runtime.getSnapshot().phase === 'disposed');

    expect(registry.get({ ownerScope: owner, token: RegistryWidget })).toBeNull();
    lease.release();
  });

  it('starts a host attachment in core and publishes only its own identity', async () => {
    const owner = createOwnerScope();
    const otherOwner = createOwnerScope();
    const listener = vi.fn();
    const unrelated = vi.fn();
    const unsubscribe = registry.subscribe({ ownerScope: owner, token: RegistryWidget }, listener);
    const unsubscribeOther = registry.subscribe({ ownerScope: otherOwner, token: RegistryWidget }, unrelated);

    const lease = registry.attach({ ownerScope: owner, props: { value: 'attached' }, token: RegistryWidget });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(unrelated).not.toHaveBeenCalled();
    await waitFor(() => lease.runtime.getSnapshot().phase === 'ready');

    lease.release();
    await waitFor(() => registry.get({ ownerScope: owner, token: RegistryWidget }) === null);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(unrelated).not.toHaveBeenCalled();
    unsubscribe();
    unsubscribeOther();
  });

  it('retains a hidden scene widget, reuses it on return, and removes an unclaimed widget after presentation', async () => {
    const owner = createOwnerScope();
    const presentation = createPresentation();
    const first = registry.attach({
      ownerScope: owner,
      presentation,
      props: { value: 'first' },
      token: RegistryWidget,
    });
    await waitFor(() => first.runtime.getSnapshot().phase === 'ready');

    presentation.retain();
    first.release();
    await flushMicrotasks();
    expect(registry.get({ ownerScope: owner, token: RegistryWidget })).toBe(first.runtime);

    presentation.focus();
    const returned = registry.attach({
      ownerScope: owner,
      presentation,
      props: { value: 'returned' },
      token: RegistryWidget,
    });
    registry.reconcilePresentation(presentation);
    expect(returned.runtime).toBe(first.runtime);
    returned.release();
    await waitFor(() => first.runtime.getSnapshot().phase === 'disposed');
  });

  it('releases a retained scene widget when the scene is removed', async () => {
    const owner = createOwnerScope();
    const presentation = createPresentation();
    const lease = registry.attach({
      ownerScope: owner,
      presentation,
      props: { value: 'owned' },
      token: RegistryWidget,
    });
    await waitFor(() => lease.runtime.getSnapshot().phase === 'ready');

    presentation.retain();
    lease.release();
    await flushMicrotasks();
    presentation.dispose();
    await waitFor(() => lease.runtime.getSnapshot().phase === 'disposed');
  });

  it('releases a lease whose scene was removed before React cleaned up the host', async () => {
    const owner = createOwnerScope();
    const presentation = createPresentation();
    const lease = registry.attach({
      ownerScope: owner,
      presentation,
      props: { value: 'removed' },
      token: RegistryWidget,
    });
    await waitFor(() => lease.runtime.getSnapshot().phase === 'ready');

    presentation.retain();
    presentation.dispose();
    lease.release();
    await waitFor(() => lease.runtime.getSnapshot().phase === 'disposed');
  });

  it('removes a hidden widget omitted from the visible presentation', async () => {
    const owner = createOwnerScope();
    const presentation = createPresentation();
    const lease = registry.attach({
      ownerScope: owner,
      presentation,
      props: { value: 'omitted' },
      token: RegistryWidget,
    });
    await waitFor(() => lease.runtime.getSnapshot().phase === 'ready');

    presentation.retain();
    lease.release();
    await flushMicrotasks();
    presentation.focus();
    registry.reconcilePresentation(presentation);
    await waitFor(() => lease.runtime.getSnapshot().phase === 'disposed');
  });

  it('keeps a retained surface lease when another surface releases the last active lease', async () => {
    const owner = createOwnerScope();
    const retained = createPresentation();
    const active = createPresentation();
    const first = registry.attach({
      ownerScope: owner,
      presentation: retained,
      props: { value: 'first' },
      token: RegistryWidget,
    });
    const second = registry.attach({
      ownerScope: owner,
      presentation: active,
      props: { value: 'second' },
      token: RegistryWidget,
    });
    await waitFor(() => first.runtime.getSnapshot().phase === 'ready');

    retained.retain();
    first.release();
    second.release();
    await flushMicrotasks();
    expect(first.runtime.getSnapshot().phase).toBe('ready');

    retained.dispose();
    await waitFor(() => first.runtime.getSnapshot().phase === 'disposed');
  });
});

const createPresentation = (): WidgetRuntimePresentation & {
  retain(): void;
  focus(): void;
  dispose(): void;
} => {
  let retained = false;
  let disposed = false;
  const listeners = new Set<() => void>();

  return {
    isRetained: () => retained && !disposed,
    onDispose: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    retain: () => {
      retained = true;
    },
    focus: () => {
      retained = false;
    },
    dispose: () => {
      disposed = true;
      for (const listener of listeners) listener();
    },
  };
};

interface RegistryWidgetProps {
  readonly value: string;
}

class RegistryWidget extends WidgetDefinition<RegistryWidgetProps> {}
class OtherRegistryWidget extends WidgetDefinition<RegistryWidgetProps> {}

configureWidgetRuntimeDefinition(RegistryWidget);
configureWidgetRuntimeDefinition(OtherRegistryWidget);

const createOwnerScope = (): ApplicationScope => {
  const scope = new ApplicationScope();

  scope.bindSession(new SessionRuntimeState());

  return scope;
};

const acquire = (registry: WidgetRuntimeRegistry, ownerScope: ApplicationScope, value: string, runtimeKey?: string) => {
  return registry.acquire({
    ownerScope,
    props: { value },
    runtimeKey,
    token: RegistryWidget,
  });
};

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const waitFor = async (predicate: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (predicate()) {
      return;
    }

    await Promise.resolve();
  }

  throw new Error('Ожидаемое состояние теста не достигнуто.');
};
