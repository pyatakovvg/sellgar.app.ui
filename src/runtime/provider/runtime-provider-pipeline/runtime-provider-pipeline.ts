import type { DependencyToken } from '../../../di/token/dependency-token';
import {
  captureRuntimeFailure,
  reportRuntimeFailure,
  RuntimeFailureReporterInterface,
  throwRuntimeFailure,
  type RuntimeFailureSource,
  type RuntimeOwner,
} from '../../failure';
import type { RuntimeScope } from '../../scope/base';
import { ProviderScope, type ProviderScopeInstance, type SingletonProviderScopeInstance } from '../../scope/kind';
import type { ProviderToken } from '../provider-token.ts';
import type {
  RuntimeProviderCleanup,
  RuntimeProviderContextInterface,
  RuntimeProviderInterface,
  RuntimeProviderPhase,
  RuntimeProviderResult,
} from '../runtime-provider';
import { isRuntimeProviderToken } from '../runtime-provider';
import { isSingletonProviderToken, type SingletonProviderInterface } from '../singleton-provider';

export type RuntimeProviderPipelineContext<TProps extends object = object> = Omit<
  RuntimeProviderContextInterface<TProps>,
  'phase'
>;

interface RetainedProviderResult {
  readonly cleanup: RuntimeProviderCleanup;
  readonly source: RuntimeFailureSource;
}

interface ResolvedSingletonProvider {
  readonly instance: SingletonProviderScopeInstance<SingletonProviderInterface>;
}

export class RuntimeProviderPipeline<TProps extends object = object> {
  private readonly providerResults: RetainedProviderResult[] = [];
  private readonly providerScopeInstances: ProviderScopeInstance<RuntimeProviderInterface<TProps>>[];
  private readonly providers: Map<DependencyToken<RuntimeProviderInterface<TProps>>, RuntimeProviderInterface<TProps>>;
  private readonly reporter: RuntimeFailureReporterInterface;
  private readonly singletonProviders: ResolvedSingletonProvider[];
  private setupPromise: Promise<void> | undefined;
  private disposed = false;

  constructor(
    scope: RuntimeScope,
    providerTokens: readonly ProviderToken<TProps>[],
    private readonly owner: RuntimeOwner,
  ) {
    const resolvedProviders = resolveProviders(scope.get(ProviderScope), providerTokens);

    this.providers = resolvedProviders.providers;
    this.providerScopeInstances = resolvedProviders.instances;
    this.singletonProviders = resolvedProviders.singletonProviders;
    this.reporter = scope.get(RuntimeFailureReporterInterface);
  }

  get size(): number {
    return this.providers.size + this.singletonProviders.length;
  }

  setup(context: RuntimeProviderPipelineContext<TProps>): Promise<void> {
    if (this.disposed) {
      throw new Error('Pipeline runtime providers уже освобождён.');
    }

    this.setupPromise ??= this.runSetup(context);

    return this.setupPromise;
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    await this.setupPromise?.catch(() => undefined);

    const providerResults = this.providerResults.splice(0).reverse();
    const providerScopeInstances = this.providerScopeInstances.splice(0).reverse();
    const singletonProviders = this.singletonProviders.splice(0).reverse();

    await Promise.all([
      ...providerResults.map((result) => this.disposeProviderResult(result)),
      ...singletonProviders.map(({ instance }) => this.disposeSingletonProvider(instance)),
      ...providerScopeInstances.map((instance) => this.disposeProviderInstance(instance)),
    ]);
  }

  async runBeforeLoad(context: RuntimeProviderPipelineContext<TProps>): Promise<void> {
    await this.run('beforeLoad', context);
  }

  async runBeforeRender(context: RuntimeProviderPipelineContext<TProps>): Promise<void> {
    await this.run('beforeRender', context);
  }

  private retainProviderResult(result: RuntimeProviderResult, source: RuntimeFailureSource): void {
    if (typeof result === 'function') {
      this.providerResults.push({ cleanup: result, source });
    }
  }

  private async runSetup(context: RuntimeProviderPipelineContext<TProps>): Promise<void> {
    await this.run('setup', context);

    for (const { instance } of this.singletonProviders) {
      await instance.setup();
    }
  }

  private async run(phase: RuntimeProviderPhase, context: RuntimeProviderPipelineContext<TProps>): Promise<void> {
    const providerContext = {
      ...context,
      phase,
    };

    for (const [token, provider] of this.providers) {
      const method = getProviderMethod(provider, phase);

      if (!method) {
        continue;
      }

      const source: RuntimeFailureSource = {
        operation: phase,
        owner: this.owner,
        participant: { kind: 'provider', token },
      };

      try {
        this.retainProviderResult(await method.call(provider, providerContext), source);
      } catch (error) {
        throwRuntimeFailure(error, source);
      }
    }
  }

  private async disposeProviderResult(result: RetainedProviderResult): Promise<void> {
    try {
      await result.cleanup();
    } catch (error) {
      await reportRuntimeFailure(
        this.reporter,
        captureRuntimeFailure(error, result.source),
        this.owner,
        'cleanup.contained',
        'disposing',
      );
    }
  }

  private async disposeSingletonProvider(
    instance: SingletonProviderScopeInstance<SingletonProviderInterface>,
  ): Promise<void> {
    try {
      await instance.dispose();
    } catch (error) {
      await this.reportRuntimeCleanupFailure(error, 'singleton-provider.lease.dispose');
    }
  }

  private async disposeProviderInstance(
    instance: ProviderScopeInstance<RuntimeProviderInterface<TProps>>,
  ): Promise<void> {
    try {
      instance.dispose();
    } catch (error) {
      await this.reportRuntimeCleanupFailure(error, 'provider.scope.dispose');
    }
  }

  private async reportRuntimeCleanupFailure(error: unknown, operation: string): Promise<void> {
    await reportRuntimeFailure(
      this.reporter,
      captureRuntimeFailure(error, {
        operation,
        owner: this.owner,
        participant: { kind: 'runtime' },
      }),
      this.owner,
      'cleanup.contained',
      'disposing',
    );
  }
}

interface ResolvedProviders<TProps extends object> {
  readonly instances: ProviderScopeInstance<RuntimeProviderInterface<TProps>>[];
  readonly providers: Map<DependencyToken<RuntimeProviderInterface<TProps>>, RuntimeProviderInterface<TProps>>;
  readonly singletonProviders: ResolvedSingletonProvider[];
}

const resolveProviders = <TProps extends object>(
  scope: ProviderScope,
  providerTokens: readonly ProviderToken<TProps>[],
): ResolvedProviders<TProps> => {
  const instances: ProviderScopeInstance<RuntimeProviderInterface<TProps>>[] = [];
  const providers = new Map<DependencyToken<RuntimeProviderInterface<TProps>>, RuntimeProviderInterface<TProps>>();
  const resolvedTokens = new Set<ProviderToken<TProps>>();
  const singletonProviders: ResolvedSingletonProvider[] = [];

  try {
    for (const providerToken of providerTokens) {
      if (resolvedTokens.has(providerToken)) {
        continue;
      }

      resolvedTokens.add(providerToken);

      if (isRuntimeProviderToken(providerToken)) {
        const runtimeProviderToken = providerToken as DependencyToken<RuntimeProviderInterface<TProps>>;
        const instance = scope.acquire(runtimeProviderToken);

        instances.push(instance);
        providers.set(runtimeProviderToken, instance.value);
        continue;
      }

      if (isSingletonProviderToken(providerToken)) {
        singletonProviders.push({
          instance: scope.acquireSingleton(providerToken as DependencyToken<SingletonProviderInterface>),
        });
        continue;
      }

      throw new Error(
        `Provider "${getProviderTokenName(providerToken)}" указан в providers metadata, но не помечен декоратором @Provider() или @SingletonProvider().`,
      );
    }
  } catch (error) {
    for (const instance of instances.reverse()) {
      instance.dispose();
    }
    for (const { instance } of singletonProviders.reverse()) {
      void instance.dispose();
    }

    throw error;
  }

  return { instances, providers, singletonProviders };
};

const getProviderTokenName = <TProps extends object>(providerToken: ProviderToken<TProps>): string => {
  if (typeof providerToken === 'function') {
    return providerToken.name || 'anonymous';
  }

  return String(providerToken);
};

const getProviderMethod = <TProps extends object>(
  provider: RuntimeProviderInterface<TProps>,
  phase: RuntimeProviderPhase,
) => {
  switch (phase) {
    case 'setup':
      return provider.setup;
    case 'afterRender':
      return provider.afterRender;
    case 'beforeLoad':
      return provider.beforeLoad;
    case 'beforeRender':
      return provider.beforeRender;
    case 'onDemand':
      return provider.onDemand;
  }
};
