import type { DependencyConstructor } from '../../../../di/binding/binding-builder';
import type { DependencyToken } from '../../../../di/token/dependency-token';
import { captureRuntimeFailure, throwRuntimeOperationError } from '../../../failure/runtime-failure-signal';
import {
  reportRuntimeFailure,
  RuntimeFailureReporterInterface,
  type RuntimeFailureSource,
  type RuntimeOwner,
} from '../../../failure/runtime-failure';
import type {
  ProviderActivateContextInterface,
  ProviderCleanup,
  ProviderInitializeContextInterface,
  ProviderResult,
} from '../../../provider/provider';
import { RuntimeScope, type RuntimeScopeBindingsLease } from '../../base/runtime-scope';

interface ProviderScopeValue {
  activate?(context: ProviderActivateContextInterface): ProviderResult | Promise<ProviderResult>;
  dispose(): void | Promise<void>;
  initialize?(context: ProviderInitializeContextInterface): ProviderResult | Promise<ProviderResult>;
}

export interface ProviderScopeInstance<TValue extends ProviderScopeValue> {
  readonly value: TValue;

  dispose(): Promise<void>;
}

export interface ApplicationProviderScopeLease<TValue extends ProviderScopeValue> {
  readonly value: TValue;

  activate(): Promise<void>;
  deactivate(): Promise<void>;
  dispose(): Promise<void>;
  initialize(): Promise<void>;
}

interface RetainedProviderResult {
  readonly cleanup: ProviderCleanup;
  readonly source: RuntimeFailureSource;
}

interface ApplicationProviderEntry<TValue extends ProviderScopeValue> {
  readonly bindingsLease: RuntimeScopeBindingsLease;
  readonly instanceScope: ProviderInstanceScope;
  readonly leases: Set<ApplicationProviderLease<TValue>>;
  readonly token: DependencyToken<TValue>;
  readonly value: TValue;
  activeLeaseCount: number;
  activationCleanup: RetainedProviderResult | undefined;
  activated: boolean;
  disposed: boolean;
  initializeCleanup: RetainedProviderResult | undefined;
  initializePromise: Promise<void> | undefined;
  initialized: boolean;
  reconcilePromise: Promise<void> | undefined;
}

interface ApplicationProviderLease<TValue extends ProviderScopeValue> {
  active: boolean;
  disposed: boolean;
  readonly instance: ApplicationProviderScopeLease<TValue>;
}

export class ProviderScope extends RuntimeScope {
  private readonly applicationAbortController = new AbortController();
  private readonly applicationEntries = new Map<
    DependencyToken<unknown>,
    ApplicationProviderEntry<ProviderScopeValue>
  >();
  private readonly runtimeInstances = new Set<ProviderScopeInstance<ProviderScopeValue>>();
  private disposing = false;

  acquireRuntime<TValue extends ProviderScopeValue>(
    token: DependencyToken<TValue>,
    ownerScope: RuntimeScope,
  ): ProviderScopeInstance<TValue> {
    this.assertAcceptingProviders();
    const instanceScope = new ProviderInstanceScope(ownerScope);

    try {
      instanceScope.activate(token);
      const value = this.resolve(instanceScope, token);
      let active = true;
      const instance: ProviderScopeInstance<TValue> = {
        value,
        dispose: async () => {
          if (!active) return;

          active = false;
          this.runtimeInstances.delete(instance as ProviderScopeInstance<ProviderScopeValue>);

          try {
            await value.dispose();
          } finally {
            instanceScope.dispose();
          }
        },
      };

      this.runtimeInstances.add(instance as ProviderScopeInstance<ProviderScopeValue>);

      return instance;
    } catch (error) {
      instanceScope.dispose();
      throw error;
    }
  }

  acquireApplication<TValue extends ProviderScopeValue>(
    token: DependencyToken<TValue>,
  ): ApplicationProviderScopeLease<TValue> {
    this.assertAcceptingProviders();
    const entry = this.getOrCreateApplicationEntry(token);
    let lease: ApplicationProviderLease<TValue>;
    const instance: ApplicationProviderScopeLease<TValue> = {
      value: entry.value,
      activate: async () => {
        this.assertLeaseActive(lease);
        await this.initializeApplicationEntry(entry);

        if (!lease.active) {
          lease.active = true;
          entry.activeLeaseCount += 1;
        }

        await this.reconcileApplicationEntry(entry);
      },
      deactivate: async () => {
        if (lease.disposed || !lease.active) return;

        lease.active = false;
        entry.activeLeaseCount -= 1;
        await this.reconcileApplicationEntry(entry);
      },
      dispose: async () => {
        if (lease.disposed) return;

        lease.disposed = true;
        entry.leases.delete(lease);

        if (lease.active) {
          lease.active = false;
          entry.activeLeaseCount -= 1;
        }

        await this.reconcileApplicationEntry(entry);
      },
      initialize: () => {
        this.assertLeaseActive(lease);
        return this.initializeApplicationEntry(entry);
      },
    };

    lease = { active: false, disposed: false, instance };
    entry.leases.add(lease);

    return instance;
  }

  async disposeProviders(): Promise<void> {
    if (this.disposing) return;

    this.disposing = true;
    this.applicationAbortController.abort(new Error('Application providers освобождены.'));
    const runtimeInstances = [...this.runtimeInstances].reverse();
    const applicationEntries = [...this.applicationEntries.values()].reverse();

    this.runtimeInstances.clear();
    this.applicationEntries.clear();
    await Promise.allSettled(runtimeInstances.map((instance) => instance.dispose()));

    for (const entry of applicationEntries) {
      await this.disposeApplicationEntry(entry);
    }

    super.dispose();
  }

  private assertAcceptingProviders(): void {
    if (this.disposing) throw new Error('ProviderScope уже освобождается.');
  }

  private assertLeaseActive(lease: ApplicationProviderLease<ProviderScopeValue>): void {
    if (lease.disposed) throw new Error('Application provider lease уже освобождён.');
  }

  private async disposeApplicationEntry(
    entry: ApplicationProviderEntry<ProviderScopeValue>,
    waitForInitialization = true,
  ): Promise<void> {
    if (entry.disposed) return;

    entry.disposed = true;

    for (const lease of entry.leases) {
      lease.active = false;
      lease.disposed = true;
    }

    entry.leases.clear();
    entry.activeLeaseCount = 0;
    if (waitForInitialization) {
      await entry.initializePromise?.catch(() => undefined);
    }
    await entry.reconcilePromise?.catch(() => undefined);
    await this.disposeRetainedResult(entry.activationCleanup);
    entry.activationCleanup = undefined;
    entry.activated = false;
    await this.disposeRetainedResult(entry.initializeCleanup);
    entry.initializeCleanup = undefined;

    try {
      await entry.value.dispose();
    } catch (error) {
      await this.reportCleanupFailure(error, createApplicationProviderSource(entry.token, 'dispose'));
    } finally {
      entry.instanceScope.dispose();
      entry.bindingsLease.dispose();
    }
  }

  private getOrCreateApplicationEntry<TValue extends ProviderScopeValue>(
    token: DependencyToken<TValue>,
  ): ApplicationProviderEntry<TValue> {
    const existing = this.applicationEntries.get(token) as ApplicationProviderEntry<TValue> | undefined;

    if (existing) return existing;

    const bindingsLease = this.retainBindings(token);
    const instanceScope = new ProviderInstanceScope(this);

    try {
      const value = this.resolve(instanceScope, token);
      const entry: ApplicationProviderEntry<TValue> = {
        activeLeaseCount: 0,
        activated: false,
        activationCleanup: undefined,
        bindingsLease,
        disposed: false,
        initializeCleanup: undefined,
        initializePromise: undefined,
        initialized: false,
        instanceScope,
        leases: new Set(),
        reconcilePromise: undefined,
        token,
        value,
      };

      this.applicationEntries.set(token, entry as ApplicationProviderEntry<ProviderScopeValue>);

      return entry;
    } catch (error) {
      instanceScope.dispose();
      bindingsLease.dispose();
      throw error;
    }
  }

  private initializeApplicationEntry(entry: ApplicationProviderEntry<ProviderScopeValue>): Promise<void> {
    if (entry.disposed) return Promise.reject(new Error('Application provider уже освобождён.'));
    if (entry.initialized) return Promise.resolve();
    if (entry.initializePromise) return entry.initializePromise;

    const source = createApplicationProviderSource(entry.token, 'initialize');
    const context: ProviderInitializeContextInterface = { signal: this.applicationAbortController.signal };
    const promise = Promise.resolve()
      .then(() => entry.value.initialize?.(context))
      .then((result) => {
        entry.initializeCleanup = retainProviderResult(result, source);
        entry.initialized = true;
      })
      .catch(async (error) => {
        this.applicationEntries.delete(entry.token);
        await this.disposeApplicationEntry(entry, false);
        throwRuntimeOperationError(error, source);
      })
      .finally(() => {
        if (entry.initializePromise === promise) entry.initializePromise = undefined;
      });

    entry.initializePromise = promise;

    return promise;
  }

  private reconcileApplicationEntry(entry: ApplicationProviderEntry<ProviderScopeValue>): Promise<void> {
    if (entry.reconcilePromise) return entry.reconcilePromise;

    const reconcilePromise = Promise.resolve()
      .then(() => this.runApplicationReconciliation(entry))
      .finally(() => {
        if (entry.reconcilePromise === reconcilePromise) entry.reconcilePromise = undefined;
      });

    entry.reconcilePromise = reconcilePromise;

    return reconcilePromise;
  }

  private async runApplicationReconciliation(entry: ApplicationProviderEntry<ProviderScopeValue>): Promise<void> {
    while (!entry.disposed) {
      if (entry.activeLeaseCount > 0 && !entry.activated) {
        const source = createApplicationProviderSource(entry.token, 'activate');
        const context: ProviderActivateContextInterface = { signal: this.applicationAbortController.signal };

        try {
          const result = await entry.value.activate?.(context);

          entry.activationCleanup = retainProviderResult(result, source);
          entry.activated = true;
        } catch (error) {
          entry.activeLeaseCount = 0;
          for (const lease of entry.leases) lease.active = false;
          throwRuntimeOperationError(error, source);
        }

        continue;
      }

      if (entry.activeLeaseCount === 0 && entry.activated) {
        const cleanup = entry.activationCleanup;

        entry.activationCleanup = undefined;
        entry.activated = false;
        await this.disposeRetainedResult(cleanup);
        continue;
      }

      return;
    }
  }

  private async disposeRetainedResult(result: RetainedProviderResult | undefined): Promise<void> {
    if (!result) return;

    try {
      await result.cleanup();
    } catch (error) {
      await this.reportCleanupFailure(error, result.source);
    }
  }

  private async reportCleanupFailure(error: unknown, source: RuntimeFailureSource): Promise<void> {
    await reportRuntimeFailure(
      this.get(RuntimeFailureReporterInterface),
      captureRuntimeFailure(error, source),
      source.owner,
      'cleanup.contained',
      'disposing',
    );
  }

  private resolve<TValue>(instanceScope: ProviderInstanceScope, token: DependencyToken<TValue>): TValue {
    instanceScope.bindSelf(token as DependencyConstructor<TValue>);

    return instanceScope.get(token);
  }
}

const retainProviderResult = (
  result: ProviderResult,
  source: RuntimeFailureSource,
): RetainedProviderResult | undefined => {
  return typeof result === 'function'
    ? { cleanup: result, source: { ...source, operation: `${source.operation}.cleanup` } }
    : undefined;
};

const createApplicationProviderSource = (token: DependencyToken<unknown>, operation: string): RuntimeFailureSource => {
  const owner: RuntimeOwner = { kind: 'application' };

  return { operation, owner, participant: { kind: 'provider', token } };
};

class ProviderInstanceScope extends RuntimeScope {
  constructor(parent: RuntimeScope) {
    super(parent);
  }
}
