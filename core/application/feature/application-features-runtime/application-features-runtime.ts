import type {
  ApplicationFeatureCleanup,
  ApplicationFeatureInterface,
  ApplicationFeatureToken,
} from '../application-feature/index.ts';
import {
  ControllerOwnerRuntime,
  type ControllerOwnerRuntimeLoadOptions,
} from '../../../runtime/controller/controller-owner-runtime/index.ts';
import { ApplicationReportDispatcherInterface } from '../../reporting/application-report/index.ts';
import type { ApplicationScope } from '../../../runtime/scope/kind/application-scope/index.ts';
import type { DependencyToken } from '../../../di/token/dependency-token/index.ts';
import { RuntimeRevalidateService } from '../../../revalidate/runtime/revalidate-service/index.ts';
import { executeRuntimeParticipant } from '../../../runtime/operation/runtime-operation/index.ts';
import { captureRuntimeFailure } from '../../../runtime/failure/runtime-failure-signal/index.ts';
import { reportRuntimeFailure, type RuntimeFailureSource } from '../../../runtime/failure/runtime-failure/index.ts';

interface ApplicationFeatureRuntimeEntry {
  readonly instance: ApplicationFeatureInterface;
  readonly token: ApplicationFeatureToken;
}

interface ApplicationFeatureRetainedCleanup {
  readonly cleanup: ApplicationFeatureCleanup;
  readonly source: RuntimeFailureSource;
}

export class ApplicationFeaturesRuntime extends ControllerOwnerRuntime<Record<string, never>> {
  private readonly controllerTokens: ReadonlySet<DependencyToken<unknown>>;
  private readonly entries: readonly ApplicationFeatureRuntimeEntry[];
  private readonly featureReporter: ApplicationReportDispatcherInterface;
  readonly requiresPreparation: boolean;

  private featureInitializationPromise: Promise<void> | null = null;
  private featureLoadPromise: Promise<void> | null = null;
  private featuresDisposed = false;
  private featuresInitialized = false;
  private retainedCleanups: ApplicationFeatureRetainedCleanup[] = [];

  constructor(
    private readonly applicationScope: ApplicationScope,
    tokens: readonly ApplicationFeatureToken[],
    features: readonly ApplicationFeatureInterface[],
  ) {
    super(applicationScope, { providers: [] }, {}, { kind: 'application' }, 'application.failed');

    if (tokens.length !== features.length) {
      throw new Error('Feature tokens and instances must have the same length.');
    }

    this.entries = tokens.map((token, index) => {
      const instance = features[index];

      if (!instance) {
        throw new Error(`Feature ${token.name || '<anonymous>'} was not resolved.`);
      }

      return { instance, token };
    });
    this.featureReporter = applicationScope.get(ApplicationReportDispatcherInterface);
    this.controllerTokens = new Set(applicationScope.getControllerTokens());
    this.requiresPreparation = this.controllerTokens.size > 0 || features.some((feature) => feature.initialize);
    applicationScope.bindRevalidate(
      new RuntimeRevalidateService((controllerToken, options) =>
        this.revalidate({ controllerToken, signal: options?.signal }),
      ),
    );
  }

  ownsController(token: DependencyToken<unknown>): boolean {
    return this.controllerTokens.has(token);
  }

  override load(options: ControllerOwnerRuntimeLoadOptions = {}): Promise<void> {
    if (this.featureLoadPromise) {
      return this.featureLoadPromise;
    }

    const load = this.loadFeatures(options).finally(() => {
      if (this.featureLoadPromise === load) {
        this.featureLoadPromise = null;
      }
    });

    this.featureLoadPromise = load;

    return load;
  }

  override async dispose(): Promise<void> {
    const runtimeDisposal = super.dispose();

    await Promise.allSettled(this.featureInitializationPromise ? [this.featureInitializationPromise] : []);
    await runtimeDisposal;
    await this.disposeFeatures();
  }

  private async loadFeatures(options: ControllerOwnerRuntimeLoadOptions): Promise<void> {
    try {
      await this.initializeFeatures(options.signal);
      await super.load(options);
    } catch (error) {
      await this.disposeFeatures();
      throw error;
    }
  }

  protected createScope(): ApplicationScope {
    return this.applicationScope;
  }

  protected activateScope(): void {
    // Application.compose has already activated feature bindings in this scope.
  }

  protected disposeScope(): void {
    // Application owns the scope and disposes it after all runtimes.
  }

  private initializeFeatures(signal?: AbortSignal): Promise<void> {
    if (this.featuresInitialized) {
      return Promise.resolve();
    }

    if (this.featureInitializationPromise) {
      return this.featureInitializationPromise;
    }

    const initialization = this.executeFeatureInitialization(signal).finally(() => {
      if (this.featureInitializationPromise === initialization) {
        this.featureInitializationPromise = null;
      }
    });

    this.featureInitializationPromise = initialization;

    return initialization;
  }

  private async executeFeatureInitialization(signal?: AbortSignal): Promise<void> {
    const results = await Promise.allSettled(
      this.entries.map(async ({ instance, token }) => {
        const initialize = instance.initialize;

        if (!initialize) {
          return null;
        }

        const source = this.createFeatureSource(token, 'initialize');
        const result = await executeRuntimeParticipant(source, () =>
          initialize.call(instance, { signal: signal ?? NEVER_ABORTED_SIGNAL }),
        );

        return typeof result === 'function'
          ? {
              cleanup: result,
              source: { ...source, operation: 'initialize.cleanup' },
            }
          : null;
      }),
    );
    const cleanups = results.flatMap((result) => (result.status === 'fulfilled' && result.value ? [result.value] : []));
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');

    if (rejected) {
      this.retainedCleanups = cleanups;
      throw rejected.reason;
    }

    this.retainedCleanups = cleanups;
    this.featuresInitialized = true;
  }

  private async disposeFeatures(): Promise<void> {
    if (this.featuresDisposed) {
      return;
    }

    this.featuresDisposed = true;
    this.featuresInitialized = false;
    await this.disposeRetainedCleanups(this.retainedCleanups.splice(0));

    for (const { instance, token } of [...this.entries].reverse()) {
      const dispose = instance.dispose;

      if (!dispose) {
        continue;
      }

      const source = this.createFeatureSource(token, 'dispose');

      try {
        await executeRuntimeParticipant(source, () => dispose.call(instance));
      } catch (error) {
        await this.reportFeatureCleanupFailure(error, source);
      }
    }
  }

  private async disposeRetainedCleanups(cleanups: readonly ApplicationFeatureRetainedCleanup[]): Promise<void> {
    for (const { cleanup, source } of [...cleanups].reverse()) {
      try {
        await cleanup();
      } catch (error) {
        await this.reportFeatureCleanupFailure(error, source);
      }
    }
  }

  private createFeatureSource(token: ApplicationFeatureToken, operation: string): RuntimeFailureSource {
    return {
      operation,
      owner: { kind: 'application' },
      participant: { kind: 'feature', token },
    };
  }

  private async reportFeatureCleanupFailure(error: unknown, source: RuntimeFailureSource): Promise<void> {
    await reportRuntimeFailure(
      this.featureReporter,
      captureRuntimeFailure(error, source),
      { kind: 'application' },
      'cleanup.contained',
      'disposing',
    );
  }
}

const NEVER_ABORTED_SIGNAL = new AbortController().signal;
