import { describe, expect, it, vi } from 'vitest';

import type { RouterBridgeInitializeContextInterface } from '../../../../core/router/bridge/router-bridge';
import {
  FsmSnapshotSourceInterface,
  type FsmSnapshotSourceListener,
  type FsmSnapshotSourceSubscription,
} from '../../source/fsm-snapshot-source';
import { createFsmRouterBridge } from './fsm-router-bridge.ts';

interface TestSnapshot {
  readonly route: string;
  readonly state?: Readonly<Record<string, unknown>>;
}

describe('FsmRouterBridge', () => {
  it('keeps initialization pending until the first snapshot is restored', async () => {
    const snapshot = Object.freeze({
      route: 'customer.cash-in.accepting',
      state: Object.freeze({ amount: 100 }),
    });
    const source = new TestFsmSnapshotSource();
    const restore = vi.fn(async () => true);
    const bridge = createFsmRouterBridge({
      routingKey: 'route',
      source,
    });
    const initialized = vi.fn();

    const initialization = bridge.initialize(createContext(restore)).then(initialized);

    await Promise.resolve();

    expect(initialized).not.toHaveBeenCalled();

    await source.publish(snapshot);
    await initialization;

    expect(restore).toHaveBeenCalledWith(
      {
        address: ['customer', 'cash-in', 'accepting'],
        nested: null,
        query: {},
        revalidate: true,
        state: snapshot,
      },
      { blockersConfirmed: true },
    );
    expect(initialized).toHaveBeenCalledOnce();
  });

  it('restores snapshots sequentially in source publication order', async () => {
    const firstRestore = createDeferred<void>();
    const source = new TestFsmSnapshotSource();
    const restore = vi
      .fn<RouterBridgeInitializeContextInterface['restore']>()
      .mockImplementationOnce(async () => {
        await firstRestore.promise;
        return true;
      })
      .mockResolvedValue(true);
    const bridge = createFsmRouterBridge({
      routingKey: 'route',
      source,
    });

    const initialization = bridge.initialize(createContext(restore));
    const firstPublication = source.publish({ route: 'initial' });
    const secondPublication = source.publish({ route: 'operator.dashboard' });

    await vi.waitFor(() => expect(restore).toHaveBeenCalledOnce());
    firstRestore.resolve();
    await Promise.all([initialization, firstPublication, secondPublication]);

    expect(restore.mock.calls.map(([location]) => location.address)).toEqual([['initial'], ['operator', 'dashboard']]);
  });

  it('waits for the next snapshot when restore does not commit a route', async () => {
    const source = new TestFsmSnapshotSource();
    const restore = vi
      .fn<RouterBridgeInitializeContextInterface['restore']>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const bridge = createFsmRouterBridge({
      routingKey: 'route',
      source,
    });
    const initialized = vi.fn();
    const initialization = bridge.initialize(createContext(restore)).then(initialized);

    await source.publish({ route: 'initial' });

    expect(initialized).not.toHaveBeenCalled();

    await source.publish({ route: 'operator.dashboard' });
    await initialization;

    expect(initialized).toHaveBeenCalledOnce();
  });

  it('rejects initialization when the initial route cannot be restored', async () => {
    const error = new Error('Module loading failed.');
    const source = new TestFsmSnapshotSource();
    const bridge = createFsmRouterBridge({
      routingKey: 'route',
      source,
    });
    const initialization = bridge.initialize(
      createContext(
        vi.fn(async () => {
          throw error;
        }),
      ),
    );
    const initializationResult = expect(initialization).rejects.toBe(error);

    await expect(source.publish({ route: 'initial' })).rejects.toBe(error);
    await initializationResult;
    expect(source.dispose).toHaveBeenCalledOnce();
  });

  it('interrupts pending initialization when its signal is aborted', async () => {
    const abortController = new AbortController();
    const abortReason = new Error('Application initialization aborted.');
    const source = new TestFsmSnapshotSource();
    const bridge = createFsmRouterBridge({
      routingKey: 'route',
      source,
    });
    const initialization = bridge.initialize(
      createContext(
        vi.fn(async () => true),
        abortController.signal,
      ),
    );
    const initializationResult = expect(initialization).rejects.toBe(abortReason);

    abortController.abort(abortReason);

    await initializationResult;
    expect(source.dispose).toHaveBeenCalledOnce();
  });

  it('disposes the snapshot source subscription', async () => {
    const source = new TestFsmSnapshotSource();
    const bridge = createFsmRouterBridge({
      routingKey: 'route',
      source,
    });

    const initialization = bridge.initialize(createContext(vi.fn(async () => true)));
    await source.publish({ route: 'initial' });
    await initialization;
    await bridge.dispose();

    expect(source.dispose).toHaveBeenCalledOnce();
  });

  it('rejects browser-style navigation operations', () => {
    const bridge = createFsmRouterBridge({
      routingKey: 'route',
      source: new TestFsmSnapshotSource(),
    });

    expect(() => bridge.back()).toThrow('FSM RouterBridge не поддерживает back navigation.');
    expect(() =>
      bridge.commit({} as never, {
        history: {} as never,
        signal: new AbortController().signal,
        source: 'internal',
      }),
    ).toThrow('FSM RouterBridge принимает переходы только из snapshot source.');
  });
});

class TestFsmSnapshotSource extends FsmSnapshotSourceInterface<TestSnapshot> {
  readonly dispose = vi.fn(async () => undefined);

  private listener: FsmSnapshotSourceListener<TestSnapshot> | null = null;

  subscribe(listener: FsmSnapshotSourceListener<TestSnapshot>): FsmSnapshotSourceSubscription {
    this.listener = listener;

    return { dispose: this.dispose };
  }

  async publish(snapshot: TestSnapshot): Promise<void> {
    await this.listener?.(snapshot);
  }
}

const createContext = (
  restore: RouterBridgeInitializeContextInterface['restore'],
  signal: AbortSignal = new AbortController().signal,
): RouterBridgeInitializeContextInterface => {
  return {
    back: async () => false,
    cancelNavigation: () => false,
    confirm: async () => true,
    navigate: {} as never,
    restore,
    router: {} as never,
    shouldBlockUnload: () => false,
    signal,
  };
};

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
};
