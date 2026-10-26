import 'reflect-metadata';

import { Application as CoreApplication } from '../../../../core/application/lifecycle/application';
import type { DependencyToken } from '../../../../core/di/token/dependency-token';
import { ContextRouterBridge } from '../../../router/bridge/context-router-bridge';
import { ApplicationConfig, type ApplicationConfiguratorInterface } from '../../config/application-config';

export class Application extends CoreApplication<never> {
  private readonly modules = new Set<{ dispose(): Promise<void> }>();
  private disposal: Promise<void> | undefined;

  constructor() {
    super(new ContextRouterBridge(), new ApplicationConfig(), {
      resolve: () => {
        throw new Error('Контекст приложения Next не разрешает маршруты фреймворка.');
      },
    });
  }

  protected configure(_app: ApplicationConfiguratorInterface): void {}

  getDependency<TValue>(token: DependencyToken<TValue>): TValue {
    return this.getApplicationScope().get(token);
  }

  /** @internal Used by the Next renderer; this is not a second DI container. */
  get contextScope() {
    return this.getApplicationScope();
  }

  /** @internal Features retain their existing core lifecycle. */
  get contextFeatures() {
    return this.getFeaturesRuntime();
  }

  /** @internal Next owns module mounts; release their resources before the application scope. */
  retainModule(module: { dispose(): Promise<void> }): () => void {
    if (this.disposal) throw new Error('Нельзя активировать модуль при освобождении приложения Next.');
    this.modules.add(module);
    return () => {
      this.modules.delete(module);
    };
  }

  override dispose(): Promise<void> {
    return (this.disposal ??= Promise.resolve().then(() => this.disposeNextApplication()));
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
