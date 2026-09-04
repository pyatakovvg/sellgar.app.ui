import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SessionRuntimeState } from '../../../application/session/session-runtime-state';
import { ApplicationScope } from '../../../runtime/scope/kind/application-scope';
import { WidgetDefinition, configureWidgetRuntimeDefinition } from '../../declaration/widget';
import { WidgetRuntimeRegistry } from './widget-runtime-registry.ts';

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

  it('disposes child runtimes when their owner scope is disposed', async () => {
    const owner = createOwnerScope();
    const lease = acquire(registry, owner, 'owned');

    await lease.runtime.load();
    owner.dispose();
    await waitFor(() => lease.runtime.getSnapshot().phase === 'disposed');

    expect(registry.get({ ownerScope: owner, token: RegistryWidget })).toBeNull();
    lease.release();
  });
});

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
