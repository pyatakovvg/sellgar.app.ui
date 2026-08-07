import React from 'react';

import { UseBindings } from '../../../di/composition/use-bindings';
import { FrameBindings } from '../../../frame/service/frame-service';
import { createReactRouterView } from '../../../react/router/adapter';
import { ExceptionProvider } from '../../../react/router/exception';
import { RevalidateBindings } from '../../../revalidate/binding/revalidate-bindings';
import { RouterRuntime } from '../../../router/runtime/router-runtime';
import { RouterServiceBindings } from '../../../router/service/router-service';
import {
  captureRuntimeFailure,
  reportRuntimeFailure,
  RuntimeFailureReporterInterface,
  throwRuntimeOperationError,
  type RuntimeFailureSource,
} from '../../../runtime/failure';
import {
  createRuntimeRevisionGuard,
  executeRuntimeOperation,
  executeRuntimeParticipant,
} from '../../../runtime/operation';
import { ApplicationScope } from '../../../runtime/scope/kind';
import { WidgetRuntimeFactoryBindings } from '../../../widget/runtime/widget-runtime-factory';
import type { DependencyConstructor } from '../../../di/binding/binding-builder';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { ApplicationConfig } from '../../config/application-config';
import { ApplicationEventBusBindings } from '../../event/application-event-bus';
import { ApplicationStoreBindings } from '../../store/application-store';
import { SessionRuntimeState, SessionRuntimeStateInterface } from '../../session/session-runtime-state';
import {
  type ApplicationInitializerToken,
  type ApplicationInitializerContextInterface,
  isApplicationInitializerToken,
  type ApplicationInitializerInterface,
} from '../../initializer/application-initializer';
import { ApplicationInitializerGroup } from '../../initializer/application-initializer-group';
import { DisposableRegistry } from '../../disposable/disposable-registry';
import { RequestExecutorInterface } from '../../request';
import type {
  ApplicationConfiguratorInterface,
  ApplicationInitializerDeclaration,
} from '../../config/application-configurator';

import { ApplicationControllerInterface } from '../application-lifecycle';
import type { ApplicationLifecyclePhase, ApplicationLifecycleSnapshot } from '../application-lifecycle';

type ApplicationLifecycleListener = () => void;

interface AutoBindableApplicationScope {
  bindSelf<TValue>(token: DependencyConstructor<TValue>): void;

  has<TValue>(token: DependencyToken<TValue>): boolean;
}

@UseBindings(
  ApplicationEventBusBindings,
  ApplicationStoreBindings,
  FrameBindings,
  RevalidateBindings,
  RouterServiceBindings,
  WidgetRuntimeFactoryBindings,
)
export abstract class Application extends ApplicationControllerInterface {
  private readonly config = new ApplicationConfig();
  private readonly disposables = new DisposableRegistry();
  private readonly listeners = new Set<ApplicationLifecycleListener>();
  private readonly routerRuntime = new RouterRuntime();
  private readonly session = new SessionRuntimeState();
  private readonly scope = new ApplicationScope();

  private initializerAbortController: AbortController | null = null;
  private initializePromise: Promise<void> | null = null;
  private lifecycleSnapshot: ApplicationLifecycleSnapshot = {
    error: null,
    phase: 'created',
  };
  private state: ApplicationLifecyclePhase = 'created';

  get lifecycle(): ApplicationLifecycleSnapshot {
    return this.lifecycleSnapshot;
  }

  compose(): void {
    if (this.state === 'composed' || this.state === 'ready') {
      return;
    }

    if (this.state === 'disposed' || this.state === 'disposing') {
      throw new Error('Приложение уже освобождено.');
    }

    this.setState('composing');

    try {
      this.scope.bindSession(this.session);
      this.scope.bindRouterRuntime(this.routerRuntime);
      this.scope.activate(this);
      this.configure(this.config);

      for (const feature of this.config.featuresValue) {
        this.scope.activate(feature);
      }

      this.setState('composed');
    } catch (error) {
      const failure = captureRuntimeFailure(error, createApplicationRuntimeSource('compose'));

      this.reportFailure(failure, 'application.activation-failed', 'failed');
      this.fail(failure.cause);
      throw failure.cause;
    }
  }

  async initialize(): Promise<void> {
    if (this.state === 'ready') {
      return;
    }

    if (this.initializePromise) {
      return this.initializePromise;
    }

    if (this.state === 'created') {
      throw new Error('Приложение нужно скомпоновать перед initialize.');
    }

    if (this.state === 'failed') {
      throw this.lifecycleSnapshot.error;
    }

    if (this.state === 'disposed' || this.state === 'disposing') {
      throw new Error('Приложение уже освобождено.');
    }

    this.initializerAbortController = new AbortController();
    this.initializePromise = this.runInitializers(this.initializerAbortController.signal).finally(() => {
      this.initializePromise = null;
    });

    return this.initializePromise;
  }

  async dispose(): Promise<void> {
    if (this.state === 'disposed' || this.state === 'disposing') {
      return;
    }

    this.setState('disposing');
    this.initializerAbortController?.abort();
    if (this.scope.has(SessionRuntimeStateInterface)) {
      this.scope.get(RequestExecutorInterface).cancelAll();
    }
    await this.routerRuntime.dispose();
    await this.disposables.dispose((error) => {
      const failure = captureRuntimeFailure(error, {
        operation: 'dispose',
        owner: { kind: 'application' },
        participant: { kind: 'disposable' },
      });

      this.reportFailure(failure, 'cleanup.contained', 'disposing');
    });
    this.scope.dispose();
    this.setState('disposed');
  }

  protected abstract configure(app: ApplicationConfiguratorInterface): void;

  createView(): React.FC {
    if (this.state === 'created' || this.state === 'composing') {
      throw new Error('Приложение нужно скомпоновать перед createView.');
    }

    const router = this.config.routerValue;
    const components = this.config.componentsValue;
    const features = this.config.featuresValue;
    const layouts = this.config.layoutsValue;
    let RouterView: React.FC | null = null;

    return () => {
      const lifecycle = useApplicationLifecycle(this);

      if (lifecycle.phase === 'failed') {
        return (
          <ExceptionProvider error={lifecycle.error}>
            {components.failed ?? components.exception ?? null}
          </ExceptionProvider>
        );
      }

      if (lifecycle.phase !== 'ready') {
        return <>{components.splash ?? null}</>;
      }

      RouterView ??= createReactRouterView(
        router,
        components,
        layouts,
        features,
        this,
        this.session,
        this.routerRuntime,
        this.scope,
      );

      return <RouterView />;
    };
  }

  subscribe(listener: ApplicationLifecycleListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private async runInitializers(signal: AbortSignal): Promise<void> {
    this.setState('initializing');

    try {
      for (const declaration of this.config.initializersValue) {
        await this.executeInitializerDeclaration(declaration, signal);
      }

      if (signal.aborted) {
        return;
      }

      this.setState('ready');
    } catch (error) {
      if (signal.aborted) {
        return;
      }

      if (error instanceof ApplicationInitializerRejected) {
        this.fail(error.cause);
        throw error.cause;
      }

      const failure = captureRuntimeFailure(error, createApplicationRuntimeSource('initialize'));

      await reportRuntimeFailure(
        this.scope.get(RuntimeFailureReporterInterface),
        failure,
        { kind: 'application' },
        'application.activation-failed',
        'failed',
      );
      this.fail(failure.cause);
      throw failure.cause;
    }
  }

  private async executeInitializerDeclaration(
    declaration: ApplicationInitializerDeclaration,
    signal: AbortSignal,
  ): Promise<void> {
    if (declaration instanceof ApplicationInitializerGroup) {
      await Promise.all(
        declaration.initializers.map((initializer) => {
          return this.executeInitializer(initializer, signal);
        }),
      );
      return;
    }

    await this.executeInitializer(declaration, signal);
  }

  private async executeInitializer(initializerToken: ApplicationInitializerToken, signal: AbortSignal): Promise<void> {
    const initializer = this.resolveInitializer(initializerToken);
    const context: ApplicationInitializerContextInterface = {
      app: this,
      disposables: this.disposables,
      session: this.session,
      signal,
    };

    const result = await executeRuntimeOperation({
      guard: createRuntimeRevisionGuard(this.session),
      operation: () =>
        executeRuntimeParticipant(
          {
            operation: 'execute',
            owner: { kind: 'application' },
            participant: {
              kind: 'initializer',
              token: initializerToken,
            },
          },
          () => initializer.execute(context),
        ),
      signal,
      source: createApplicationRuntimeSource('initialize'),
    });

    switch (result.type) {
      case 'completed':
      case 'interrupted':
        return;
      case 'rejected':
        throw new ApplicationInitializerRejected(result.error);
      case 'failed':
        return throwRuntimeOperationError(result.failure.cause, result.failure.source);
    }
  }

  private resolveInitializer(initializerToken: ApplicationInitializerToken): ApplicationInitializerInterface {
    if (isAutoBindableApplicationScope(this.scope) && !this.scope.has(initializerToken)) {
      this.assertInitializerToken(initializerToken);
      this.scope.bindSelf(initializerToken as DependencyConstructor<ApplicationInitializerInterface>);
    }

    return this.scope.get(initializerToken);
  }

  private assertInitializerToken(initializerToken: ApplicationInitializerToken): void {
    if (!isApplicationInitializerToken(initializerToken)) {
      throw new Error('Initializer class must be decorated with @Initializer().');
    }
  }

  private fail(error: unknown): void {
    this.setLifecycle('failed', error);
  }

  private reportFailure(
    failure: ReturnType<typeof captureRuntimeFailure>,
    disposition: 'application.activation-failed' | 'cleanup.contained',
    ownerState: string,
  ): void {
    try {
      void reportRuntimeFailure(
        this.scope.get(RuntimeFailureReporterInterface),
        failure,
        { kind: 'application' },
        disposition,
        ownerState,
      );
    } catch (cause) {
      globalThis.console.error({
        cause,
        runtimeFailure: failure,
      });
    }
  }

  private setState(state: ApplicationLifecyclePhase): void {
    this.setLifecycle(state, null);
  }

  private setLifecycle(state: ApplicationLifecyclePhase, error: unknown): void {
    this.state = state;
    this.lifecycleSnapshot = {
      error,
      phase: state,
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

const useApplicationLifecycle = (application: Application): ApplicationLifecycleSnapshot => {
  return React.useSyncExternalStore(
    (listener) => application.subscribe(listener),
    () => application.lifecycle,
    () => application.lifecycle,
  );
};

const createApplicationRuntimeSource = (operation: string): RuntimeFailureSource => {
  return {
    operation,
    owner: { kind: 'application' },
    participant: { kind: 'runtime' },
  };
};

class ApplicationInitializerRejected extends Error {
  constructor(readonly cause: unknown) {
    super('Application initializer was rejected by an expected operation result.', { cause });
  }
}

const isAutoBindableApplicationScope = (
  scope: ApplicationScope,
): scope is ApplicationScope & AutoBindableApplicationScope => {
  return (
    'bindSelf' in scope && 'has' in scope && typeof scope.bindSelf === 'function' && typeof scope.has === 'function'
  );
};
