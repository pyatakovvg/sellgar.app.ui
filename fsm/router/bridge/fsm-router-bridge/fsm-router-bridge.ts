import type {
  RouterBridgeCommitContextInterface,
  RouterBridgeInitializeContextInterface,
  RouterBridgeInterface,
  RouterBridgeLocationInterface,
} from '../../../../core/router/bridge/router-bridge';
import type { NavigationState } from '../../../../core/router/runtime/navigation-state';
import type { FsmSnapshotSourceInterface, FsmSnapshotSourceSubscription } from '../../source/fsm-snapshot-source';

type StringPropertyKey<TValue extends object> = {
  [TKey in keyof TValue]-?: TValue[TKey] extends string ? TKey : never;
}[keyof TValue] &
  string;

export interface FsmRouterBridgeOptions<TSnapshot extends object> {
  readonly routingKey: StringPropertyKey<TSnapshot>;
  readonly source: FsmSnapshotSourceInterface<TSnapshot>;
}

export const createFsmRouterBridge = <TSnapshot extends object>(
  options: FsmRouterBridgeOptions<TSnapshot>,
): RouterBridgeInterface => {
  return new FsmRouterBridge(options);
};

class FsmRouterBridge<TSnapshot extends object> implements RouterBridgeInterface {
  readonly runtimeRetention = 'release' as const;

  private context: RouterBridgeInitializeContextInterface | null = null;
  private rejectInitialization: ((reason?: unknown) => void) | null = null;
  private resolveInitialization: (() => void) | null = null;
  private sourceSubscription: FsmSnapshotSourceSubscription | null = null;
  private restoreQueue = Promise.resolve();

  constructor(private readonly options: FsmRouterBridgeOptions<TSnapshot>) {}

  back(): never {
    throw new Error('FSM RouterBridge не поддерживает back navigation.');
  }

  async initialize(context: RouterBridgeInitializeContextInterface): Promise<void> {
    if (this.context) {
      throw new Error('FSM RouterBridge уже инициализирован.');
    }

    this.context = context;
    context.signal.addEventListener('abort', this.handleInitializationAbort, { once: true });

    const initialization = new Promise<void>((resolve, reject) => {
      this.resolveInitialization = resolve;
      this.rejectInitialization = reject;

      try {
        this.sourceSubscription = this.options.source.subscribe(this.handleSnapshot);
      } catch (error) {
        reject(error);
      }
    });

    if (context.signal.aborted) {
      this.handleInitializationAbort();
    }

    try {
      await initialization;
    } catch (error) {
      await this.dispose();
      throw error;
    } finally {
      this.resolveInitialization = null;
      this.rejectInitialization = null;
    }
  }

  commit(_navigation: NavigationState, context: RouterBridgeCommitContextInterface): void {
    if (context.source !== 'external') {
      throw new Error('FSM RouterBridge принимает переходы только из snapshot source.');
    }
  }

  async dispose(): Promise<void> {
    const subscription = this.sourceSubscription;
    const context = this.context;

    this.rejectInitialization?.(context?.signal.reason ?? new Error('FSM RouterBridge освобождён до инициализации.'));
    this.sourceSubscription = null;
    this.context = null;
    context?.signal.removeEventListener('abort', this.handleInitializationAbort);
    await subscription?.dispose();
    await this.restoreQueue;
  }

  private readonly handleInitializationAbort = (): void => {
    void this.dispose();
  };

  private readonly handleSnapshot = (snapshot: TSnapshot): Promise<void> => {
    const restore = this.restoreQueue.then(() => this.restoreSnapshot(snapshot));
    const completion = restore.then(
      (restored) => {
        if (restored) {
          this.resolveInitialization?.();
        }
      },
      (error: unknown) => {
        this.rejectInitialization?.(error);
        throw error;
      },
    );

    this.restoreQueue = completion.catch(() => undefined);

    return completion;
  };

  private async restoreSnapshot(snapshot: TSnapshot): Promise<boolean> {
    const context = this.context;

    if (!context || context.signal.aborted) {
      return false;
    }

    return context.restore(createFsmLocation(snapshot, this.options.routingKey), { blockersConfirmed: true });
  }
}

const EMPTY_QUERY = Object.freeze<Record<string, never>>({});

const createFsmLocation = <TSnapshot extends object>(
  snapshot: TSnapshot,
  routingKey: StringPropertyKey<TSnapshot>,
): RouterBridgeLocationInterface => {
  const address: unknown = snapshot[routingKey];

  if (typeof address !== 'string') {
    throw new Error(`FSM snapshot не содержит строковый routing key: ${routingKey}.`);
  }

  return Object.freeze({
    address: Object.freeze(parseAddress(address)),
    nested: null,
    query: EMPTY_QUERY,
    revalidate: true,
    state: snapshot,
  });
};

const parseAddress = (address: string): readonly string[] => {
  const segments = address.split('.');

  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
    throw new Error(`FSM snapshot содержит некорректный адрес: ${address}.`);
  }

  return segments;
};
