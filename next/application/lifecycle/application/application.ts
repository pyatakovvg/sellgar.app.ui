import 'reflect-metadata';

import { Application as CoreApplication } from '../../../../core/application/lifecycle/application';
import type { ApplicationFeaturesRuntime } from '../../../../core/application/feature/application-features-runtime';
import type { ApplicationFeatureToken } from '../../../../core/application/feature/application-feature';
import type { DependencyToken } from '../../../../core/di/token/dependency-token';
import type { ApplicationScope } from '../../../../core/runtime/scope/kind/application-scope';
import { ContextRouterBridge } from '../../../router/bridge/context-router-bridge';
import type { ApplicationSnapshot } from '../../state/application-state';

import {
  ApplicationConfig,
  type ApplicationConfiguratorInterface,
  type ApplicationComponents,
} from '../../config/application-config';

interface ApplicationRuntimeAccess {
  readonly scope: ApplicationScope;
  captureSnapshot(): ApplicationSnapshot;
  hydrateSnapshot(snapshot: ApplicationSnapshot): void;
  getFeatures(): ApplicationFeaturesRuntime;
  getFeatureTokens(): readonly ApplicationFeatureToken[];
  getComponents(): ApplicationComponents;
  retainModule(module: { dispose(): Promise<void> }): () => void;
}

const runtimes = new WeakMap<Application, ApplicationRuntimeAccess>();

export function getApplicationRuntime(app: Application): ApplicationRuntimeAccess {
  const runtime = runtimes.get(app);
  if (!runtime) throw new Error('Runtime приложения Next не зарегистрирован.');
  return runtime;
}

export class Application extends CoreApplication<never, ApplicationConfig> {
  private readonly modules = new Set<{ dispose(): Promise<void> }>();
  private disposal: Promise<void> | undefined;

  constructor() {
    const config = new ApplicationConfig();
    super(new ContextRouterBridge(), config, {
      resolve: () => {
        throw new Error('Контекст приложения Next не разрешает маршруты фреймворка.');
      },
    });

    runtimes.set(this, {
      scope: this.getApplicationScope(),
      captureSnapshot: () =>
        Object.fromEntries(config.statesValue.map((token) => [token.key, this.getDependency(token).serialize()])),
      hydrateSnapshot: (snapshot) => {
        for (const token of config.statesValue) {
          if (!Object.hasOwn(snapshot, token.key)) throw new Error(`Missing application state: ${token.key}`);
          this.getDependency(token).hydrate(token.deserialize(snapshot[token.key]));
        }
      },
      getFeatures: () => this.getFeaturesRuntime(),
      getFeatureTokens: () => config.featuresValue,
      getComponents: () => config.componentsValue,
      retainModule: (module) => {
        if (this.disposal) throw new Error('Нельзя активировать модуль при освобождении приложения Next.');
        this.modules.add(module);
        return () => {
          this.modules.delete(module);
        };
      },
    });
  }

  protected configure(_app: ApplicationConfiguratorInterface): void {
    // Subclasses may register features; Next itself owns the route tree.
  }

  getDependency<TValue>(token: DependencyToken<TValue>): TValue {
    return this.getApplicationScope().get(token);
  }

  override dispose(): Promise<void> {
    this.disposal ??= Promise.resolve().then(() => this.disposeNextApplication());
    return this.disposal;
  }

  private async disposeNextApplication(): Promise<void> {
    const results = await Promise.allSettled([...this.modules].map((module) => module.dispose()));
    this.modules.clear();
    await super.dispose();
    const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
    if (errors.length) throw new AggregateError(errors, 'Не удалось освободить модули Next.');
  }
}

export interface ApplicationFactoryContext {
  readonly request?: { readonly headers: Readonly<Record<string, string>> };
  readonly snapshot?: ApplicationSnapshot;
}

export type ApplicationFactory = (context?: ApplicationFactoryContext) => Application | Promise<Application>;

export async function startApplication(
  factory: ApplicationFactory,
  context?: ApplicationFactoryContext,
): Promise<Application> {
  const app = await factory(context);

  try {
    app.compose();
    if (context?.snapshot) getApplicationRuntime(app).hydrateSnapshot(context.snapshot);
    await app.initialize();

    if (app.lifecycle.phase !== 'ready') {
      throw app.lifecycle.exception?.cause ?? new Error('Приложение Next не достигло фазы ready.');
    }

    return app;
  } catch (error) {
    await app.dispose().catch((cleanupError: unknown) => {
      console.error('[sellgar/app/next] Не удалось освободить приложение', cleanupError);
    });
    throw error;
  }
}
