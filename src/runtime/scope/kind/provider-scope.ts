import type { DependencyConstructor } from '../../../di/binding/binding-builder';
import type { DependencyToken } from '../../../di/token/dependency-token';
import type { RuntimeProviderCleanup, RuntimeProviderResult } from '../../provider/runtime-provider';
import {
  captureRuntimeFailure,
  reportRuntimeFailure,
  RuntimeFailureReporterInterface,
  throwRuntimeFailure,
  type RuntimeFailureSource,
} from '../../failure';

import { RuntimeScope, type RuntimeScopeBindingsLease } from '../base';

export interface ProviderScopeInstance<TValue> {
  readonly value: TValue;

  dispose(): void;
}

export interface SingletonProviderScopeInstance<TValue> {
  readonly value: TValue;

  setup(): Promise<void>;
  dispose(): Promise<void>;
}

interface SingletonProviderEntry<TValue> {
  readonly bindingsLease: RuntimeScopeBindingsLease;
  readonly instanceScope: ProviderInstanceScope;
  readonly leases: Set<SingletonProviderLease<TValue>>;
  readonly value: TValue;
  activeLeaseCount: number;
  cleanup: RetainedSingletonProviderResult | undefined;
  reconcilePromise: Promise<void> | undefined;
  started: boolean;
  readonly token: DependencyToken<TValue>;
}

interface RetainedSingletonProviderResult {
  readonly cleanup: RuntimeProviderCleanup;
  readonly source: RuntimeFailureSource;
}

interface SingletonProviderLease<TValue> {
  active: boolean;
  disposed: boolean;
  readonly instance: SingletonProviderScopeInstance<TValue>;
}

interface SingletonProviderValue {
  setup(): RuntimeProviderResult | Promise<RuntimeProviderResult>;
}

export class ProviderScope extends RuntimeScope {
  private readonly instances = new Set<ProviderScopeInstance<unknown>>();
  private readonly singletonEntries = new Map<
    DependencyToken<unknown>,
    SingletonProviderEntry<SingletonProviderValue>
  >();

  acquire<TValue>(token: DependencyToken<TValue>): ProviderScopeInstance<TValue> {
    const bindingsLease = this.retainBindings(token);
    const instanceScope = new ProviderInstanceScope(this);

    try {
      const value = this.resolve(instanceScope, token);
      let active = true;
      const instance: ProviderScopeInstance<TValue> = {
        value,
        dispose: () => {
          if (!active) {
            return;
          }

          active = false;
          this.instances.delete(instance as ProviderScopeInstance<unknown>);
          instanceScope.dispose();
          bindingsLease.dispose();
        },
      };

      this.instances.add(instance as ProviderScopeInstance<unknown>);

      return instance;
    } catch (error) {
      instanceScope.dispose();
      bindingsLease.dispose();
      throw error;
    }
  }

  acquireSingleton<TValue extends SingletonProviderValue>(
    token: DependencyToken<TValue>,
  ): SingletonProviderScopeInstance<TValue> {
    const entry = this.getOrCreateSingletonEntry(token);
    let lease: SingletonProviderLease<TValue>;
    const instance: SingletonProviderScopeInstance<TValue> = {
      value: entry.value,
      setup: () => {
        if (lease.disposed) {
          throw new Error('Singleton provider lease уже освобождён.');
        }

        if (!lease.active) {
          lease.active = true;
          entry.activeLeaseCount += 1;
        }

        return this.reconcileSingletonEntry(entry);
      },
      dispose: async () => {
        if (lease.disposed) {
          return;
        }

        lease.disposed = true;
        entry.leases.delete(lease);

        if (lease.active) {
          lease.active = false;
          entry.activeLeaseCount -= 1;
        }

        await this.reconcileSingletonEntry(entry);
      },
    };

    lease = {
      active: false,
      disposed: false,
      instance,
    };
    entry.leases.add(lease);

    return instance;
  }

  override dispose(): void {
    for (const instance of [...this.instances].reverse()) {
      instance.dispose();
    }

    const singletonEntries = [...this.singletonEntries.values()].reverse();
    const singletonDisposals = singletonEntries.flatMap((entry) => {
      return [...entry.leases].reverse().map(({ instance }) => instance.dispose());
    });

    this.singletonEntries.clear();
    void Promise.allSettled(singletonDisposals).then(() => {
      for (const entry of singletonEntries) {
        entry.instanceScope.dispose();
        entry.bindingsLease.dispose();
      }
    });

    super.dispose();
  }

  private getOrCreateSingletonEntry<TValue extends SingletonProviderValue>(
    token: DependencyToken<TValue>,
  ): SingletonProviderEntry<TValue> {
    const existing = this.singletonEntries.get(token) as SingletonProviderEntry<TValue> | undefined;

    if (existing) {
      return existing;
    }

    const bindingsLease = this.retainBindings(token);
    const instanceScope = new ProviderInstanceScope(this);

    try {
      const value = this.resolve(instanceScope, token);
      const entry: SingletonProviderEntry<TValue> = {
        activeLeaseCount: 0,
        bindingsLease,
        cleanup: undefined,
        instanceScope,
        leases: new Set(),
        reconcilePromise: undefined,
        started: false,
        token,
        value,
      };

      this.singletonEntries.set(token, entry as SingletonProviderEntry<SingletonProviderValue>);

      return entry;
    } catch (error) {
      instanceScope.dispose();
      bindingsLease.dispose();
      throw error;
    }
  }

  private reconcileSingletonEntry(entry: SingletonProviderEntry<SingletonProviderValue>): Promise<void> {
    if (entry.reconcilePromise) {
      return entry.reconcilePromise;
    }

    const reconcilePromise = Promise.resolve()
      .then(() => this.runSingletonReconciliation(entry))
      .finally(() => {
        if (entry.reconcilePromise === reconcilePromise) {
          entry.reconcilePromise = undefined;
        }
      });

    entry.reconcilePromise = reconcilePromise;

    return reconcilePromise;
  }

  private async runSingletonReconciliation(entry: SingletonProviderEntry<SingletonProviderValue>): Promise<void> {
    while (true) {
      if (entry.activeLeaseCount > 0 && !entry.started) {
        let result: RuntimeProviderResult = undefined;
        const source = createSingletonProviderSource(entry.token, 'setup');

        try {
          result = await entry.value.setup();
        } catch (error) {
          entry.activeLeaseCount = 0;

          for (const lease of entry.leases) {
            lease.active = false;
          }

          throwRuntimeFailure(error, source);
        }

        entry.cleanup = this.retainSingletonProviderResult(result, source);
        entry.started = true;
        continue;
      }

      if (entry.activeLeaseCount === 0 && entry.started) {
        const retainedResult = entry.cleanup;

        entry.cleanup = undefined;
        entry.started = false;
        await this.disposeSingletonProviderResult(retainedResult);
        continue;
      }

      return;
    }
  }

  private retainSingletonProviderResult(
    result: RuntimeProviderResult,
    source: RuntimeFailureSource,
  ): RetainedSingletonProviderResult | undefined {
    if (typeof result === 'function') {
      return {
        cleanup: result,
        source: {
          ...source,
          operation: 'setup.dispose',
        },
      };
    }

    return undefined;
  }

  private async disposeSingletonProviderResult(
    retainedResult: RetainedSingletonProviderResult | undefined,
  ): Promise<void> {
    if (!retainedResult) {
      return;
    }

    try {
      await retainedResult.cleanup();
    } catch (error) {
      await reportRuntimeFailure(
        this.get(RuntimeFailureReporterInterface),
        captureRuntimeFailure(error, retainedResult.source),
        retainedResult.source.owner,
        'cleanup.contained',
        'disposing',
      );
    }
  }

  private resolve<TValue>(instanceScope: ProviderInstanceScope, token: DependencyToken<TValue>): TValue {
    instanceScope.bindSelf(token as DependencyConstructor<TValue>);

    return instanceScope.get(token);
  }
}

const createSingletonProviderSource = (token: DependencyToken<unknown>, operation: string): RuntimeFailureSource => {
  return {
    operation,
    owner: { kind: 'application' },
    participant: {
      kind: 'singleton-provider',
      token,
    },
  };
};

class ProviderInstanceScope extends RuntimeScope {
  constructor(parent: ProviderScope) {
    super(parent);
  }
}
