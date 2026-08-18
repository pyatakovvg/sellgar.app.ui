import type { ControllerArgs, WithParams, WithPayload } from '../../../controller/contract/controller';
import 'reflect-metadata';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Controller } from '../../../controller/contract/controller';

import type { ApplicationControllerInterface } from '../../../application/lifecycle/application-lifecycle';
import { SessionRuntimeState } from '../../../application/session/session-runtime-state';
import { BindingModuleInterface } from '../../../di/binding/binding-module';
import { Inject, Injectable } from '../../../di/injection/decorators';
import { UseBindings } from '../../../di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { GuardInterface } from '../../../guard/contract/guard';
import { GuardRejectedException } from '../../../guard/contract/guard-rejected-exception';
import { UseGuards } from '../../../guard/declaration/use-guards';
import { Layout } from '../../../layout/declaration/layout';
import { ApplicationScope } from '../../../runtime/scope/kind';
import { RuntimeExceptionServiceInterface } from '../../../runtime/exception';
import { Provider } from '../../../runtime/provider/runtime-provider';
import {
  NavigateServiceInterface,
  type NavigateFrame,
  type RouterHashNavigateOptions,
  type RouterNavigateOptions,
  type RouterSearchNavigateOptions,
} from '../../../router/service/navigate-service';
import type { RouterHashObject } from '../../../router/utils/hash-utils';
import type { RouterSearchObject } from '../../../router/utils/search-utils';
import type { RouterLocationSnapshot } from '../../../router/service/location-service';
import type { FrameConstructor } from '../../declaration/frame';

import { Frame } from '../../declaration/frame';

import { RevalidateServiceInterface } from '../../../revalidate/contract/revalidate-service';

import { FrameRuntime } from './';

describe('FrameRuntime', () => {
  beforeEach(() => {
    TestFrameProvider.beforeRenderHandler = null;
    TestFrameProvider.beforeRenderError = null;
    TestFrameController.actionHandler = null;
    TestFrameController.loaderSuffix = '';
    TestFrameController.loaderRuntimeException = null;
    TestFrameController.runtimeException = null;
    TestFrameLoaderGuard.result = true;
    TestFrameProvider.events = [];
    TestNavigateService.closeFrameMock.mockReset();
    TestNavigateService.openFrameMock.mockReset();
  });

  it('loads frame controllers and providers', async () => {
    const runtime = createFrameRuntime();

    await runtime.load(createLoadOptions());

    expect(runtime.getLoaderData(TestFrameController)).toEqual({
      params: {
        routeId: '42',
        value: 'ready',
      },
      value: 'ready',
    });
    expect(TestFrameProvider.events).toEqual(['beforeLoad:beforeLoad', 'setup:setup', 'beforeRender:beforeRender']);
  });

  it('runs frame layout providers after frame providers', async () => {
    const runtime = createFrameRuntime(TestFrameWithLayout);

    await runtime.load(createLoadOptions());

    expect(TestFrameProvider.events).toEqual([
      'beforeLoad:beforeLoad',
      'layoutBeforeLoad:beforeLoad',
      'setup:setup',
      'layoutSetup:setup',
      'beforeRender:beforeRender',
      'layoutBeforeRender:beforeRender',
    ]);
  });

  it('runs frame action and allows controller-driven revalidate', async () => {
    const runtime = createFrameRuntime();

    await runtime.load(createLoadOptions());

    const result = await runtime.action(TestFrameController, {
      value: 'submitted',
    });

    expect(result).toEqual({
      value: 'ready:submitted',
    });
    expect(runtime.getLoaderData(TestFrameController)).toEqual({
      params: {
        routeId: '42',
        value: 'ready',
      },
      value: 'ready:revalidated',
    });
  });

  it('navigates to the next absolute frame route', async () => {
    const runtime = createFrameRuntime();

    await runtime.load(createLoadOptions());

    await runtime.action(TestFrameController, {
      value: 'open',
    });

    expect(TestNavigateService.openFrameMock).toHaveBeenCalledWith('/next', undefined);
  });

  it('blocks frame controller loader when guard rejects', async () => {
    const runtime = createFrameRuntime();

    TestFrameLoaderGuard.result = false;

    await expect(runtime.load(createLoadOptions())).rejects.toBeInstanceOf(GuardRejectedException);
    expect(runtime.getSnapshot().phase).toBe('failed');
  });

  it('revalidates frame loader data without recreating runtime scope', async () => {
    const runtime = createFrameRuntime();

    await runtime.load(createLoadOptions());

    TestFrameController.loaderSuffix = 'updated';

    await runtime.revalidate();

    expect(runtime.getLoaderData(TestFrameController)).toEqual({
      params: {
        routeId: '42',
        value: 'ready',
      },
      value: 'ready:updated',
    });
    expect(TestFrameProvider.events.filter((event) => event === 'setup:setup')).toHaveLength(1);
  });

  it('keeps failed frame runtime available until frame dispose', async () => {
    const error = new Error('beforeRender фрейма завершился с ошибкой.');
    const runtime = createFrameRuntime();

    TestFrameProvider.beforeRenderError = error;

    await expect(runtime.load(createLoadOptions())).rejects.toBe(error);

    expect(runtime.getSnapshot()).toEqual({
      error,
      phase: 'failed',
    });
    expect(runtime.getActiveRuntimeOrNull()).not.toBeNull();

    await runtime.dispose();

    expect(runtime.getActiveRuntimeOrNull()).toBeNull();
    expect(runtime.getSnapshot().phase).toBe('disposed');
  });

  it('moves ready frame runtime to failed when its React view render fails', async () => {
    const error = new Error('Рендеринг view фрейма завершился с ошибкой.');
    const runtime = createFrameRuntime();

    await runtime.load(createLoadOptions());
    await runtime.failRender(error);

    expect(runtime.getSnapshot()).toEqual({
      error,
      phase: 'failed',
    });
    expect(runtime.getActiveRuntimeOrNull()).not.toBeNull();
  });

  it('does not move stale session load errors into failed phase', async () => {
    const session = new SessionRuntimeState();
    const error = new Error('Сессия фрейма устарела.');
    const runtime = createFrameRuntime();

    session.setAuthenticated();
    TestFrameProvider.beforeRenderHandler = () => {
      session.setAnonymous();
      throw error;
    };

    await expect(runtime.load(createLoadOptions(session))).resolves.toBeUndefined();

    expect(runtime.getSnapshot()).toEqual({
      error: null,
      phase: 'idle',
    });
  });

  it('does not reject stale load when frame is disposed before load completes', async () => {
    const deferred = createDeferred<void>();
    const runtime = createFrameRuntime();

    TestFrameProvider.beforeRenderHandler = async () => {
      await deferred.promise;
    };

    const loadPromise = runtime.load(createLoadOptions());

    await vi.waitFor(() => {
      expect(TestFrameProvider.events).toContain('beforeRender:beforeRender');
    });

    await runtime.dispose();

    deferred.resolve();

    await expect(loadPromise).resolves.toBeUndefined();
    expect(runtime.getSnapshot().phase).toBe('disposed');
  });

  it('does not reject revalidate when session changes before revalidation error', async () => {
    const session = new SessionRuntimeState();
    const error = new Error('Сессия фрейма устарела.');
    const runtime = createFrameRuntime();

    session.setAuthenticated();
    await runtime.load(createLoadOptions(session));

    TestFrameController.loaderSuffix = 'updated';
    TestFrameProvider.beforeRenderHandler = () => {
      session.setAnonymous();
      throw error;
    };

    await expect(runtime.revalidate()).resolves.toBeUndefined();

    expect(runtime.getSnapshot().phase).toBe('ready');
    expect(runtime.getLoaderData(TestFrameController)).toEqual({
      params: {
        routeId: '42',
        value: 'ready',
      },
      value: 'ready',
    });
  });

  it('does not reject action when session changes before action error', async () => {
    const session = new SessionRuntimeState();
    const error = new Error('Сессия фрейма устарела.');
    const runtime = createFrameRuntime();

    session.setAuthenticated();
    await runtime.load(createLoadOptions(session));

    TestFrameController.actionHandler = () => {
      session.setAnonymous();
      throw error;
    };

    await expect(
      runtime.action(TestFrameController, {
        value: 'submitted',
      }),
    ).resolves.toBeUndefined();
  });

  it('keeps frame action error in submit state without rejecting', async () => {
    const error = new Error('Действие фрейма завершилось с ошибкой.');
    const runtime = createFrameRuntime();

    TestFrameController.actionHandler = () => {
      throw error;
    };
    await runtime.load(createLoadOptions());

    await expect(
      runtime.action(TestFrameController, {
        value: 'submitted',
      }),
    ).resolves.toBeUndefined();

    expect(runtime.getActionState(TestFrameController)).toEqual({
      data: undefined,
      error,
      inProcess: false,
    });
    expect(runtime.getSnapshot()).toEqual({
      error: null,
      phase: 'ready',
    });
  });

  it('moves frame to failed when action explicitly raises runtime exception', async () => {
    const error = new Error('Критическая ошибка фрейма.');
    const runtime = createFrameRuntime();

    TestFrameController.runtimeException = error;
    await runtime.load(createLoadOptions());

    await expect(
      runtime.action(TestFrameController, {
        value: 'submitted',
      }),
    ).resolves.toBeUndefined();

    expect(runtime.getActionState(TestFrameController).error).toBeUndefined();
    expect(runtime.getSnapshot()).toEqual({
      error,
      phase: 'failed',
    });
  });

  it('moves frame to failed when loader explicitly raises runtime exception', async () => {
    const error = new Error('Критическая loader-ошибка фрейма.');
    const runtime = createFrameRuntime();

    TestFrameController.loaderRuntimeException = error;

    await expect(runtime.load(createLoadOptions())).rejects.toBe(error);
    expect(runtime.getSnapshot()).toEqual({
      error,
      phase: 'failed',
    });
  });

  it('allows controller to close its current frame without action abort error', async () => {
    const runtime = createFrameRuntime();
    const loadOptions = createLoadOptions();
    const actionAbortController = new AbortController();

    TestNavigateService.closeFrameMock.mockImplementation(async () => {
      actionAbortController.abort();
    });

    await runtime.load(loadOptions);

    const result = await runtime.action(
      TestFrameController,
      {
        value: 'close',
      },
      {
        signal: actionAbortController.signal,
      },
    );

    expect(result).toEqual({
      value: 'ready:close',
    });
    expect(TestNavigateService.closeFrameMock).toHaveBeenCalledWith(undefined);
  });
});

interface TestFrameParams {
  readonly routeId: string;
  readonly value: string;
}

interface TestFrameActionPayload {
  readonly value: string;
}

type TestFrameLoaderArgs = ControllerArgs<WithParams<TestFrameParams>>;

abstract class TestFrameLoaderGuardInterface extends GuardInterface<TestFrameLoaderArgs> {}

@Injectable()
class TestFrameLoaderGuard extends TestFrameLoaderGuardInterface {
  static result = true;

  execute(): boolean {
    return TestFrameLoaderGuard.result;
  }
}

@Controller()
class TestFrameController {
  static actionHandler: (() => void) | null = null;
  static loaderSuffix = '';
  static loaderRuntimeException: Error | null = null;
  static runtimeException: Error | null = null;

  constructor(
    @Inject(RevalidateServiceInterface)
    private readonly revalidateService: RevalidateServiceInterface,
    @Inject(NavigateServiceInterface)
    private readonly navigate: NavigateServiceInterface,
    @Inject(RuntimeExceptionServiceInterface)
    private readonly runtimeExceptionService: RuntimeExceptionServiceInterface,
  ) {}

  async action(
    args: ControllerArgs<WithPayload<TestFrameActionPayload, WithParams<TestFrameParams>>>,
  ): Promise<{ value: string }> {
    TestFrameController.actionHandler?.();

    if (TestFrameController.runtimeException) {
      this.runtimeExceptionService.raise(TestFrameController.runtimeException);
    }

    if (args.payload.value === 'close') {
      await this.navigate.frame.close();

      return {
        value: `${args.params.value}:${args.payload.value}`,
      };
    }

    if (args.payload.value === 'open') {
      await this.navigate.frame.open('/next');

      return {
        value: `${args.params.value}:${args.payload.value}`,
      };
    }

    TestFrameController.loaderSuffix = 'revalidated';

    await this.revalidateService.revalidate();

    return {
      value: `${args.params.value}:${args.payload.value}`,
    };
  }

  @UseGuards(TestFrameLoaderGuardInterface)
  async loader(args: TestFrameLoaderArgs): Promise<unknown> {
    if (TestFrameController.loaderRuntimeException) {
      this.runtimeExceptionService.raise(TestFrameController.loaderRuntimeException);
    }

    const suffix = TestFrameController.loaderSuffix ? `:${TestFrameController.loaderSuffix}` : '';

    return {
      params: args.params,
      value: `${args.params.value}${suffix}`,
    };
  }
}

@Provider()
class TestFrameProvider {
  static beforeRenderHandler: (() => void) | null = null;
  static beforeRenderError: Error | null = null;
  static events: string[] = [];

  setup(context: { readonly phase: string }): void {
    TestFrameProvider.events.push(`setup:${context.phase}`);
  }

  beforeLoad(context: { readonly phase: string }): void {
    TestFrameProvider.events.push(`beforeLoad:${context.phase}`);
  }

  beforeRender(context: { readonly phase: string }): void {
    TestFrameProvider.events.push(`beforeRender:${context.phase}`);
    TestFrameProvider.beforeRenderHandler?.();

    if (TestFrameProvider.beforeRenderError) {
      throw TestFrameProvider.beforeRenderError;
    }
  }
}

@Provider()
class TestFrameLayoutProvider {
  setup(context: { readonly phase: string }): void {
    TestFrameProvider.events.push(`layoutSetup:${context.phase}`);
  }

  beforeLoad(context: { readonly phase: string }): void {
    TestFrameProvider.events.push(`layoutBeforeLoad:${context.phase}`);
  }

  beforeRender(context: { readonly phase: string }): void {
    TestFrameProvider.events.push(`layoutBeforeRender:${context.phase}`);
  }
}

class TestFrameBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(TestFrameController).toSelf().inSingletonScope();
    registry.bind(TestFrameLoaderGuardInterface).to(TestFrameLoaderGuard).inSingletonScope();
  }
}

@UseBindings(TestFrameBindings)
@Frame({
  providers: [TestFrameProvider],
  view: () => null,
})
class TestFrame {}

@Layout({
  providers: [TestFrameLayoutProvider],
  view: () => null,
})
class TestFrameLayout {}

@UseBindings(TestFrameBindings)
@Frame({
  layouts: [TestFrameLayout],
  providers: [TestFrameProvider],
  view: () => null,
})
class TestFrameWithLayout {}

class TestNavigateService implements NavigateServiceInterface {
  static closeFrameMock = vi.fn();
  static openFrameMock = vi.fn();

  readonly frame: NavigateFrame = {
    close: async (options) => {
      await TestNavigateService.closeFrameMock(options);
    },
    open: async (source, options) => {
      await TestNavigateService.openFrameMock(source, options);
    },
  };

  async back(): Promise<void> {}

  async hashParams(_to: RouterHashObject, _options?: RouterHashNavigateOptions): Promise<void> {}

  async replace(_to: string, _options?: Omit<RouterNavigateOptions, 'replace'>): Promise<void> {}

  async searchParams(_to: RouterSearchObject, _options?: RouterSearchNavigateOptions): Promise<void> {}

  async to(_to: string, _options?: RouterNavigateOptions): Promise<void> {}
}

class TestRuntimeBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(NavigateServiceInterface).toConstantValue(new TestNavigateService());
  }
}

@UseBindings(TestRuntimeBindings)
class TestRuntimeOwner {}

const createFrameRuntime = (frame: FrameConstructor = TestFrame): FrameRuntime => {
  const scope = new ApplicationScope();

  scope.bindSession(new SessionRuntimeState());
  scope.activate(TestRuntimeOwner);

  return new FrameRuntime(scope, frame);
};

const createLoadOptions = (session = new SessionRuntimeState()) => {
  return {
    app: createApplicationController(),
    location: createLocation(),
    session,
  };
};

const createApplicationController = (): ApplicationControllerInterface => {
  return {
    lifecycle: {
      error: null,
      phase: 'ready',
    },
  };
};

const createLocation = (): RouterLocationSnapshot => {
  return {
    hash: '',
    hashParams: {},
    key: 'test',
    params: {
      routeId: '42',
      value: 'ready',
    },
    pathname: '/',
    search: '',
    searchParams: {},
    state: null,
  };
};

interface Deferred<TValue = void> {
  readonly promise: Promise<TValue>;
  readonly resolve: (value?: TValue) => void;
}

function createDeferred<TValue = void>(): Deferred<TValue> {
  let resolve: Deferred<TValue>['resolve'] = () => {};
  const promise = new Promise<TValue>((promiseResolve) => {
    resolve = promiseResolve as Deferred<TValue>['resolve'];
  });

  return {
    promise,
    resolve,
  };
}
