import type { DependencyToken } from '../../../di/token/dependency-token';
import { captureRuntimeFailure, throwRuntimeOperationError } from '../../failure/runtime-failure-signal';
import {
  reportRuntimeFailure,
  RuntimeFailureReporterInterface,
  type RuntimeFailureSource,
  type RuntimeOwner,
} from '../../failure/runtime-failure';
import type { RuntimeScope } from '../../scope/base/runtime-scope';
import {
  ProviderScope,
  type ApplicationProviderScopeLease,
  type ProviderScopeInstance,
} from '../../scope/kind/provider-scope';
import { getProviderMetadata } from '../provider-metadata';
import {
  bindProviderScope,
  type ProviderActivateContextInterface,
  type ProviderCleanup,
  type ProviderInitializeContextInterface,
  type ProviderInterface,
  type ProviderPrepareContextInterface,
  type ProviderResult,
  type ProviderRevalidationContextInterface,
  type ProviderRuntimeContextInterface,
} from '../provider';
import type { ProviderToken } from '../provider-token';

export interface ProviderPipelineContext<TProps extends object = object> {
  readonly params: Readonly<Record<string, unknown>>;
  readonly props: Readonly<TProps>;
  readonly scope: RuntimeScope;
  readonly signal: AbortSignal;
}

interface ResolvedRuntimeProvider<TProps extends object> {
  readonly instance: ProviderScopeInstance<ProviderInterface<TProps>>;
  readonly token: DependencyToken<ProviderInterface<TProps>>;
}

interface ResolvedApplicationProvider<TProps extends object> {
  readonly lease: ApplicationProviderScopeLease<ProviderInterface<TProps>>;
  readonly token: DependencyToken<ProviderInterface<TProps>>;
}

interface RetainedProviderResult {
  readonly cleanup: ProviderCleanup;
  readonly source: RuntimeFailureSource;
}

type ProviderHookContext<TProps extends object> =
  ProviderActivateContextInterface | ProviderInitializeContextInterface | ProviderRuntimeContextInterface<TProps>;

export class ProviderPipeline<TProps extends object = object> {
  private readonly applicationProviders: ResolvedApplicationProvider<TProps>[];
  private readonly cleanupTasks = new Set<Promise<void>>();
  private readonly initializationCleanups: RetainedProviderResult[] = [];
  private readonly reporter: RuntimeFailureReporterInterface;
  private readonly runtimeProviders: ResolvedRuntimeProvider<TProps>[];
  private activationCleanups: RetainedProviderResult[] = [];
  private activationPromise: Promise<void> | undefined;
  private initializationPromise: Promise<void> | undefined;
  private initialized = false;
  private preparedCleanups: RetainedProviderResult[] = [];
  private preparationPromise: Promise<void> | undefined;
  private pendingActivationCleanups: RetainedProviderResult[] | undefined;
  private pendingPreparationCleanups: RetainedProviderResult[] | undefined;
  private active = false;
  private committed = false;
  private disposed = false;

  constructor(
    scope: RuntimeScope,
    providerTokens: readonly ProviderToken<TProps>[],
    private readonly owner: RuntimeOwner,
  ) {
    const resolved = resolveProviders(scope.get(ProviderScope), providerTokens, scope);

    this.applicationProviders = resolved.applicationProviders;
    this.runtimeProviders = resolved.runtimeProviders;
    this.reporter = scope.get(RuntimeFailureReporterInterface);
  }

  get size(): number {
    return this.runtimeProviders.length + this.applicationProviders.length;
  }

  get isCommitted(): boolean {
    return this.committed;
  }

  get isActive(): boolean {
    return this.active;
  }

  get hasPendingCommit(): boolean {
    return this.pendingPreparationCleanups !== undefined && this.pendingActivationCleanups !== undefined;
  }

  initialize(context: Pick<ProviderPipelineContext<TProps>, 'scope' | 'signal'>): Promise<void> {
    this.assertActive();

    if (this.initialized) return Promise.resolve();
    if (this.initializationPromise) return this.initializationPromise;

    const runtimeContext = bindProviderScope<ProviderInitializeContextInterface>(
      { signal: context.signal },
      context.scope,
    );
    const promise = settleOperations([
      this.runRuntimeHook('initialize', runtimeContext, this.initializationCleanups),
      ...this.applicationProviders.map(({ lease }) => lease.initialize()),
    ])
      .then(() => {
        this.initialized = true;
      })
      .finally(() => {
        if (this.initializationPromise === promise) this.initializationPromise = undefined;
      });

    this.initializationPromise = promise;

    return promise;
  }

  prepare(context: ProviderPipelineContext<TProps>): Promise<void> {
    this.assertActive();

    if (this.preparationPromise) return this.preparationPromise;

    const promise = this.executePreparation(context).finally(() => {
      if (this.preparationPromise === promise) this.preparationPromise = undefined;
    });

    this.preparationPromise = promise;

    return promise;
  }

  activate(context: Pick<ProviderPipelineContext<TProps>, 'scope' | 'signal'>): Promise<void> {
    this.assertActive();

    if (this.activationPromise) return this.activationPromise;

    const promise = this.executeActivation(context).finally(() => {
      if (this.activationPromise === promise) this.activationPromise = undefined;
    });

    this.activationPromise = promise;

    return promise;
  }

  private async executePreparation(context: ProviderPipelineContext<TProps>): Promise<void> {
    await this.initialize(context);
    this.assertActive();

    if (this.pendingPreparationCleanups) {
      throw new Error('Provider preparation уже выполнена и ожидает commit или discard.');
    }

    if (this.active) {
      throw new Error('Активный ProviderPipeline нельзя повторно подготовить до deactivate.');
    }

    const cleanups: RetainedProviderResult[] = [];
    const providerContext = bindProviderScope<ProviderPrepareContextInterface<TProps>>(
      {
        params: Object.freeze({ ...context.params }),
        props: Object.freeze({ ...context.props }) as Readonly<TProps>,
        signal: context.signal,
      },
      context.scope,
    );

    this.pendingPreparationCleanups = cleanups;

    try {
      await this.runRuntimeHook('prepare', providerContext, cleanups);
    } catch (error) {
      this.pendingPreparationCleanups = undefined;
      await this.disposeResults(cleanups);
      throw error;
    }
  }

  private async executeActivation(context: Pick<ProviderPipelineContext<TProps>, 'scope' | 'signal'>): Promise<void> {
    await this.preparationPromise;
    await this.initialize(context);
    this.assertActive();

    if (!this.pendingPreparationCleanups && !this.committed) {
      throw new Error('ProviderPipeline нужно подготовить перед activate.');
    }

    if (this.pendingActivationCleanups || this.active) return;

    const cleanups: RetainedProviderResult[] = [];
    const runtimeContext = bindProviderScope<ProviderActivateContextInterface>(
      { signal: context.signal },
      context.scope,
    );

    this.pendingActivationCleanups = cleanups;

    try {
      await settleOperations([
        this.runRuntimeHook('activate', runtimeContext, cleanups),
        ...this.applicationProviders.map(({ lease }) => lease.activate()),
      ]);
    } catch (error) {
      this.pendingActivationCleanups = undefined;
      await Promise.allSettled(this.applicationProviders.map(({ lease }) => lease.deactivate()));
      await this.disposeResults(cleanups);
      throw error;
    }
  }

  commit(): void {
    this.assertActive();

    if (!this.pendingPreparationCleanups || !this.pendingActivationCleanups) {
      throw new Error('ProviderPipeline не готов к commit.');
    }

    const previousPrepared = this.preparedCleanups;

    this.preparedCleanups = this.pendingPreparationCleanups;
    this.activationCleanups = this.pendingActivationCleanups;
    this.pendingPreparationCleanups = undefined;
    this.pendingActivationCleanups = undefined;
    this.active = true;
    this.committed = true;
    this.scheduleResultsDisposal(previousPrepared);
  }

  async discard(): Promise<void> {
    if (this.disposed) return;

    await Promise.allSettled([this.preparationPromise, this.activationPromise].filter(isPromise));
    await this.discardPending();
  }

  async deactivate(): Promise<void> {
    if (this.disposed) return;

    await this.deactivateCommitted();
  }

  async focus(context: Pick<ProviderPipelineContext<TProps>, 'scope' | 'signal'>): Promise<void> {
    this.assertActive();

    if (!this.committed) {
      throw new Error('Сфокусировать можно только committed ProviderPipeline.');
    }

    if (this.active) return;

    await this.executeActivation(context);

    const activation = this.pendingActivationCleanups;

    if (!activation) {
      throw new Error('ProviderPipeline не подготовил activation при возврате из retained.');
    }

    this.pendingActivationCleanups = undefined;
    this.activationCleanups = activation;
    this.active = true;
  }

  async revalidate(context: ProviderPipelineContext<TProps>): Promise<void> {
    this.assertActive();

    if (!this.active) {
      throw new Error('Неактивный ProviderPipeline нельзя ревалидировать.');
    }

    const providerContext = bindProviderScope<ProviderRevalidationContextInterface<TProps>>(
      {
        params: Object.freeze({ ...context.params }),
        props: Object.freeze({ ...context.props }) as Readonly<TProps>,
        signal: context.signal,
      },
      context.scope,
    );

    await this.runRuntimeHook('revalidate', providerContext);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;

    this.disposed = true;
    this.committed = false;
    await Promise.allSettled(
      [this.initializationPromise, this.preparationPromise, this.activationPromise].filter(isPromise),
    );
    await this.discardPending();
    await this.deactivateCommitted();
    await Promise.allSettled(this.applicationProviders.map(({ lease }) => lease.dispose()));
    await this.disposeResults(this.preparedCleanups.splice(0));
    await Promise.allSettled([...this.cleanupTasks]);
    await this.disposeResults(this.initializationCleanups.splice(0));

    for (const { instance, token } of [...this.runtimeProviders].reverse()) {
      try {
        await instance.dispose();
      } catch (error) {
        await this.reportCleanupFailure(error, this.createSource(token, 'dispose'));
      }
    }
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('ProviderPipeline уже освобождён.');
  }

  private createSource(token: DependencyToken<unknown>, operation: string): RuntimeFailureSource {
    return { operation, owner: this.owner, participant: { kind: 'provider', token } };
  }

  private async discardPending(): Promise<void> {
    const activation = this.pendingActivationCleanups;
    const preparation = this.pendingPreparationCleanups;

    this.pendingActivationCleanups = undefined;
    this.pendingPreparationCleanups = undefined;

    if (activation) {
      await Promise.allSettled(this.applicationProviders.map(({ lease }) => lease.deactivate()));
      await this.disposeResults(activation);
    }

    await this.disposeResults(preparation ?? []);
  }

  private async deactivateCommitted(): Promise<void> {
    if (!this.active) return;

    const activation = this.activationCleanups;

    this.active = false;
    this.activationCleanups = [];
    await Promise.allSettled(this.applicationProviders.map(({ lease }) => lease.deactivate()));
    await this.disposeResults(activation);
  }

  private async disposeResults(results: readonly RetainedProviderResult[]): Promise<void> {
    for (const result of [...results].reverse()) {
      try {
        await result.cleanup();
      } catch (error) {
        await this.reportCleanupFailure(error, result.source);
      }
    }
  }

  private async reportCleanupFailure(error: unknown, source: RuntimeFailureSource): Promise<void> {
    await reportRuntimeFailure(
      this.reporter,
      captureRuntimeFailure(error, source),
      this.owner,
      'cleanup.contained',
      'disposing',
    );
  }

  private scheduleResultsDisposal(results: readonly RetainedProviderResult[]): void {
    if (results.length === 0) return;

    const task = this.disposeResults(results).finally(() => this.cleanupTasks.delete(task));

    this.cleanupTasks.add(task);
  }

  private async runRuntimeHook(
    hook: 'activate' | 'initialize' | 'prepare' | 'revalidate',
    context: ProviderHookContext<TProps>,
    cleanups: RetainedProviderResult[] = [],
  ): Promise<void> {
    await settleOperations(
      this.runtimeProviders.map(async ({ instance, token }) => {
        const method = instance.value[hook] as
          ((hookContext: ProviderHookContext<TProps>) => ProviderResult | Promise<ProviderResult>) | undefined;

        if (!method) return;

        const source = this.createSource(token, hook);

        try {
          const result = await method.call(instance.value, context);

          if (typeof result === 'function') {
            cleanups.push({ cleanup: result, source: { ...source, operation: `${hook}.cleanup` } });
          }
        } catch (error) {
          throwRuntimeOperationError(error, source);
        }
      }),
    );
  }
}

interface ResolvedProviders<TProps extends object> {
  readonly applicationProviders: ResolvedApplicationProvider<TProps>[];
  readonly runtimeProviders: ResolvedRuntimeProvider<TProps>[];
}

interface ProviderDefinition<TProps extends object> {
  readonly lifetime: 'application' | 'runtime';
  readonly token: DependencyToken<ProviderInterface<TProps>>;
}

const resolveProviders = <TProps extends object>(
  providerScope: ProviderScope,
  providerTokens: readonly ProviderToken<TProps>[],
  ownerScope: RuntimeScope,
): ResolvedProviders<TProps> => {
  const applicationProviders: ResolvedApplicationProvider<TProps>[] = [];
  const runtimeProviders: ResolvedRuntimeProvider<TProps>[] = [];
  const resolvedTokens = new Set<ProviderToken<TProps>>();
  const definitions: ProviderDefinition<TProps>[] = [];

  for (const providerToken of providerTokens) {
    if (resolvedTokens.has(providerToken)) continue;
    resolvedTokens.add(providerToken);

    const metadata = getProviderMetadata(providerToken);

    if (!metadata) {
      throw new Error(
        `Provider "${getProviderTokenName(providerToken)}" указан в providers metadata, но не помечен декоратором @Provider().`,
      );
    }

    validateProviderToken(providerToken, metadata.lifetime);
    definitions.push({
      lifetime: metadata.lifetime,
      token: providerToken as DependencyToken<ProviderInterface<TProps>>,
    });
  }

  try {
    for (const { lifetime, token } of definitions) {
      if (lifetime === 'application') {
        applicationProviders.push({ lease: providerScope.acquireApplication(token), token });
      } else {
        runtimeProviders.push({ instance: providerScope.acquireRuntime(token, ownerScope), token });
      }
    }
  } catch (error) {
    for (const { instance } of runtimeProviders.reverse()) void instance.dispose().catch(() => undefined);
    for (const { lease } of applicationProviders.reverse()) void lease.dispose().catch(() => undefined);
    throw error;
  }

  return { applicationProviders, runtimeProviders };
};

const validateProviderToken = (token: ProviderToken, lifetime: 'application' | 'runtime'): void => {
  const prototype = typeof token === 'function' ? token.prototype : undefined;
  const name = getProviderTokenName(token);

  if (!prototype || typeof prototype.dispose !== 'function') {
    throw new Error(`Provider "${name}" должен реализовать обязательный dispose().`);
  }

  if (lifetime !== 'application') return;

  for (const hook of ['prepare', 'revalidate'] as const) {
    if (typeof prototype[hook] === 'function') {
      throw new Error(`Provider "${name}" с lifetime "application" не может реализовывать ${hook}().`);
    }
  }
};

const getProviderTokenName = (providerToken: ProviderToken): string => {
  return typeof providerToken === 'function' ? providerToken.name || 'anonymous' : String(providerToken);
};

const isPromise = (value: Promise<void> | undefined): value is Promise<void> => value !== undefined;

const settleOperations = async (operations: readonly Promise<unknown>[]): Promise<void> => {
  const results = await Promise.allSettled(operations);
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');

  if (rejected) throw rejected.reason;
};
