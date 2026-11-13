import 'reflect-metadata';

import { Application as CoreApplication } from '../../../../core/application/lifecycle/application';
import type { ApplicationFeaturesRuntime } from '../../../../core/application/feature/application-features-runtime';
import type { DependencyToken } from '../../../../core/di/token/dependency-token';
import type { ApplicationScope } from '../../../../core/runtime/scope/kind/application-scope';
import { ContextRouterBridge } from '../../../router/bridge/context-router-bridge';
import { ApplicationConfig, type ApplicationConfiguratorInterface } from '../../config/application-config';

interface ApplicationRuntimeAccess {
  readonly scope: ApplicationScope;
  getFeatures(): ApplicationFeaturesRuntime;
  retainModule(module: { dispose(): Promise<void> }): () => void;
}

const runtimes = new WeakMap<Application, ApplicationRuntimeAccess>();

export function getApplicationRuntime(app: Application): ApplicationRuntimeAccess {
  const runtime = runtimes.get(app);
  if (!runtime) throw new Error('Runtime приложения Next не зарегистрирован.');
  return runtime;
}

export class Application extends CoreApplication<never> {
  private readonly modules = new Set<{ dispose(): Promise<void> }>();
  private disposal: Promise<void> | undefined;

  constructor() {
    super(new ContextRouterBridge(), new ApplicationConfig(), {
      resolve: () => {
        throw new Error('Контекст приложения Next не разрешает маршруты фреймворка.');
      },
    });

    runtimes.set(this, {
      scope: this.getApplicationScope(),
      getFeatures: () => this.getFeaturesRuntime(),
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

export type ApplicationFactory = () => Application | Promise<Application>;

export async function startApplication(factory: ApplicationFactory): Promise<Application> {
  const app = await factory();

  try {
    app.compose();
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
