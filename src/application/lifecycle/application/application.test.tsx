import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UseBindings } from '../../../di/composition/use-bindings';
import { BindingModuleInterface } from '../../../di/binding/binding-module';
import { Inject, Injectable } from '../../../di/injection/decorators';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { Route } from '../../../router/declaration/route';
import { Router } from '../../../router/declaration/router';
import { RouterRuntime } from '../../../router/runtime/router-runtime';
import { ApplicationScope } from '../../../runtime/scope/kind';
import { RuntimeFailureReporter } from '../../reporting/runtime-failure-reporter';
import { SessionRuntimeStateInterface } from '../../session/session-runtime-state';
import { Initializers } from '../../initializer/initializer';
import { Initializer, ApplicationInitializerInterface } from '../../initializer/application-initializer';
import type { ApplicationInitializerContextInterface } from '../../initializer/application-initializer';
import type {
  ApplicationConfiguratorInterface,
  ApplicationInitializerDeclaration,
} from '../../config/application-configurator';

import { Application } from './application.tsx';

const createReactRouterViewMock = vi.hoisted(() => {
  return vi.fn(() => {
    return () => 'Router view';
  });
});

vi.mock('../../../react/router/adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../react/router/adapter')>();

  return {
    ...actual,
    createReactRouterView: createReactRouterViewMock,
  };
});

describe('Application lifecycle', () => {
  beforeEach(() => {
    TestRuntime.reset();
    createReactRouterViewMock.mockClear();
  });

  it('rejects initialize before compose', async () => {
    const app = new TestApplication();

    await expect(app.initialize()).rejects.toThrow('Приложение нужно скомпоновать перед initialize.');
  });

  it('reuses active initialize execution', async () => {
    const deferred = createDeferred<void>();
    const app = new TestApplication({
      initializers: [BlockingInitializer],
    });

    TestRuntime.blockingInitializerDeferred = deferred;

    app.compose();

    const firstInitialize = app.initialize();
    const secondInitialize = app.initialize();

    await waitFor(() => {
      expect(TestRuntime.blockingInitializerExecute).toHaveBeenCalledTimes(1);
    });

    deferred.resolve();

    await Promise.all([firstInitialize, secondInitialize]);

    expect(app.lifecycle).toEqual({
      error: null,
      phase: 'ready',
    });
  });

  it('runs initializer groups in parallel', async () => {
    const firstDeferred = createDeferred<void>();
    const secondDeferred = createDeferred<void>();
    const app = new TestApplication({
      initializers: [Initializers.parallel([FirstParallelInitializer, SecondParallelInitializer])],
    });

    TestRuntime.firstParallelInitializerDeferred = firstDeferred;
    TestRuntime.secondParallelInitializerDeferred = secondDeferred;

    app.compose();

    const initializePromise = app.initialize();

    await waitFor(() => {
      expect(TestRuntime.firstParallelInitializerExecute).toHaveBeenCalled();
      expect(TestRuntime.secondParallelInitializerExecute).toHaveBeenCalled();
    });

    firstDeferred.resolve();
    secondDeferred.resolve();

    await initializePromise;

    expect(app.lifecycle.phase).toBe('ready');
  });

  it('aborts initializer signal on dispose', async () => {
    const app = new TestApplication({
      initializers: [AbortAwareInitializer],
    });

    app.compose();

    const initializePromise = app.initialize();

    await waitFor(() => {
      expect(TestRuntime.abortAwareInitializerSignal).not.toBeNull();
    });

    await app.dispose();
    await initializePromise;

    expect(TestRuntime.abortAwareInitializerSignal?.aborted).toBe(true);
    expect(app.lifecycle.phase).toBe('disposed');
  });

  it('disposes router runtime before application disposables and scope', async () => {
    const order: string[] = [];
    const routerDispose = vi.spyOn(RouterRuntime.prototype, 'dispose').mockImplementation(async () => {
      order.push('router');
    });
    const scopeDispose = vi.spyOn(ApplicationScope.prototype, 'dispose').mockImplementation(() => {
      order.push('scope');
    });
    const app = new TestApplication({
      initializers: [DisposableInitializer],
    });

    TestRuntime.disposeOrder = order;

    try {
      app.compose();
      await app.initialize();
      await app.dispose();

      expect(order).toEqual(['router', 'disposable', 'scope']);
      expect(app.lifecycle.phase).toBe('disposed');
    } finally {
      routerDispose.mockRestore();
      scopeDispose.mockRestore();
    }
  });

  it('moves to failed state and reports initializer errors', async () => {
    const reportFailure = vi.spyOn(RuntimeFailureReporter.prototype, 'report').mockResolvedValue();
    const app = new TestApplication({
      initializers: [FailingInitializer],
    });

    try {
      app.compose();

      await expect(app.initialize()).rejects.toThrow('Инициализатор завершился с ошибкой.');

      expect(app.lifecycle.phase).toBe('failed');
      expect(reportFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          disposition: 'application.activation-failed',
          failure: expect.objectContaining({
            cause: TestRuntime.initializerError,
            source: expect.objectContaining({
              operation: 'execute',
              owner: { kind: 'application' },
              participant: {
                kind: 'initializer',
                token: FailingInitializer,
              },
            }),
          }),
          ownerState: 'failed',
        }),
      );
    } finally {
      reportFailure.mockRestore();
    }
  });

  it('renders splash before ready and router view after ready', async () => {
    const app = new TestApplication();

    app.compose();

    const View = app.createView();
    const screen = render(<View />);

    expect(screen.getByText('Splash')).toBeInTheDocument();

    await app.initialize();

    await waitFor(() => {
      expect(screen.getByText('Router view')).toBeInTheDocument();
    });
  });

  it('renders exception view when lifecycle fails', async () => {
    const app = new TestApplication({
      initializers: [FailingInitializer],
    });

    app.compose();

    const View = app.createView();
    const screen = render(<View />);

    await expect(app.initialize()).rejects.toThrow('Инициализатор завершился с ошибкой.');

    await waitFor(() => {
      expect(screen.getByText('Exception')).toBeInTheDocument();
    });
  });

  it('exposes application session through DI', async () => {
    const app = new TestApplication({
      initializers: [SessionAwareInitializer],
    });

    app.compose();
    await app.initialize();

    expect(TestRuntime.sessionPhase).toBe('authenticated');
  });

  it('auto-binds decorated initializers', async () => {
    const app = new TestApplication({
      initializers: [AutoBoundInitializer],
    });

    app.compose();
    await app.initialize();

    expect(TestRuntime.autoBoundInitializerExecute).toHaveBeenCalledTimes(1);
  });
});

interface TestApplicationOptions {
  readonly initializers?: readonly ApplicationInitializerDeclaration[];
}

class TestApplicationBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(BlockingInitializer).to(BlockingInitializer).inSingletonScope();
    registry.bind(FirstParallelInitializer).to(FirstParallelInitializer).inSingletonScope();
    registry.bind(SecondParallelInitializer).to(SecondParallelInitializer).inSingletonScope();
    registry.bind(AbortAwareInitializer).to(AbortAwareInitializer).inSingletonScope();
    registry.bind(DisposableInitializer).to(DisposableInitializer).inSingletonScope();
    registry.bind(FailingInitializer).to(FailingInitializer).inSingletonScope();
    registry.bind(SessionAwareInitializer).to(SessionAwareInitializer).inSingletonScope();
  }
}

@UseBindings(TestApplicationBindings)
class TestApplication extends Application {
  constructor(private readonly options: TestApplicationOptions = {}) {
    super();
  }

  protected configure(app: ApplicationConfiguratorInterface): void {
    app.components({
      exception: <div>Exception</div>,
      fallback: <div>Fallback</div>,
      forbidden: <div>Forbidden</div>,
      notFound: <div>Not found</div>,
      splash: <div>Splash</div>,
    });
    app.initializers(this.options.initializers ?? []);
    app.router(
      new Router({
        routes: [
          new Route({
            load: async () => ({}),
          }),
        ],
      }),
    );
  }
}

@Injectable()
class BlockingInitializer extends ApplicationInitializerInterface {
  async execute(): Promise<void> {
    TestRuntime.blockingInitializerExecute();
    await TestRuntime.blockingInitializerDeferred?.promise;
  }
}

@Injectable()
class FirstParallelInitializer extends ApplicationInitializerInterface {
  async execute(): Promise<void> {
    TestRuntime.firstParallelInitializerExecute();
    await TestRuntime.firstParallelInitializerDeferred?.promise;
  }
}

@Injectable()
class SecondParallelInitializer extends ApplicationInitializerInterface {
  async execute(): Promise<void> {
    TestRuntime.secondParallelInitializerExecute();
    await TestRuntime.secondParallelInitializerDeferred?.promise;
  }
}

@Injectable()
class AbortAwareInitializer extends ApplicationInitializerInterface {
  execute(context: ApplicationInitializerContextInterface): Promise<void> {
    TestRuntime.abortAwareInitializerSignal = context.signal;

    return new Promise((resolve) => {
      context.signal.addEventListener('abort', () => {
        resolve();
      });
    });
  }
}

@Injectable()
class DisposableInitializer extends ApplicationInitializerInterface {
  execute(context: ApplicationInitializerContextInterface): void {
    context.disposables.add(() => {
      TestRuntime.disposeOrder.push('disposable');
    });
  }
}

@Injectable()
class FailingInitializer extends ApplicationInitializerInterface {
  execute(): void {
    throw TestRuntime.initializerError;
  }
}

@Injectable()
class SessionAwareInitializer extends ApplicationInitializerInterface {
  constructor(
    @Inject(SessionRuntimeStateInterface)
    private readonly session: SessionRuntimeStateInterface,
  ) {
    super();
  }

  execute(): void {
    this.session.setAuthenticated();
    TestRuntime.sessionPhase = this.session.phase;
  }
}

@Initializer()
class AutoBoundInitializer extends ApplicationInitializerInterface {
  execute(): void {
    TestRuntime.autoBoundInitializerExecute();
  }
}

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  readonly resolve: (value: TValue | PromiseLike<TValue>) => void;
  readonly reject: (reason?: unknown) => void;
}

const createDeferred = <TValue,>(): Deferred<TValue> => {
  let resolve!: Deferred<TValue>['resolve'];
  let reject!: Deferred<TValue>['reject'];
  const promise = new Promise<TValue>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject,
    resolve,
  };
};

class TestRuntime {
  static abortAwareInitializerSignal: AbortSignal | null = null;
  static autoBoundInitializerExecute = vi.fn();
  static blockingInitializerDeferred: Deferred<void> | null = null;
  static blockingInitializerExecute = vi.fn();
  static disposeOrder: string[] = [];
  static firstParallelInitializerDeferred: Deferred<void> | null = null;
  static firstParallelInitializerExecute = vi.fn();
  static initializerError = new Error('Инициализатор завершился с ошибкой.');
  static secondParallelInitializerDeferred: Deferred<void> | null = null;
  static secondParallelInitializerExecute = vi.fn();
  static sessionPhase: string | null = null;

  static reset(): void {
    TestRuntime.abortAwareInitializerSignal = null;
    TestRuntime.autoBoundInitializerExecute = vi.fn();
    TestRuntime.blockingInitializerDeferred = null;
    TestRuntime.blockingInitializerExecute = vi.fn();
    TestRuntime.disposeOrder = [];
    TestRuntime.firstParallelInitializerDeferred = null;
    TestRuntime.firstParallelInitializerExecute = vi.fn();
    TestRuntime.initializerError = new Error('Инициализатор завершился с ошибкой.');
    TestRuntime.secondParallelInitializerDeferred = null;
    TestRuntime.secondParallelInitializerExecute = vi.fn();
    TestRuntime.sessionPhase = null;
  }
}
