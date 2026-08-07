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
import { Policy, PolicyInterface } from '../../../policy/contract/policy';
import type { PolicyResult } from '../../../policy/contract/policy-result';
import { ApplicationScope } from '../../../runtime/scope/kind';
import { Provider } from '../../../runtime/provider/runtime-provider';
import type { NavigateServiceInterface } from '../../../router/service/navigate-service';
import type { RouterLocationSnapshot } from '../../../router/service/location-service';
import type { RouteRuntimeContextInterface } from '../../../router/runtime/route-runtime-context';
import type { FrameConstructor } from '../../declaration/frame';
import { createFrameNavigationEntry } from '../../navigation/frame-navigation-state';
import { FrameServiceInterface, type FrameOpenArgs } from '../../service/frame-service';
import { HashFrameSource } from '../../source/hash-frame-source';

import { Frame, FrameDefinition } from '../../declaration/frame';
import type { FrameSourceCloseHandler } from '../../source/frame-source';

import {
  FrameControllerInterface,
  type FrameControllerActionArgs,
  type FrameControllerLoaderArgs,
} from '../frame-controller';
import { RevalidateServiceInterface } from '../../../revalidate/contract/revalidate-service';

import { FrameRuntime } from './';

describe('FrameRuntime', () => {
  beforeEach(() => {
    TestFrameProvider.beforeRenderHandler = null;
    TestFrameProvider.beforeRenderError = null;
    TestFrameController.actionHandler = null;
    TestFrameController.loaderSuffix = '';
    TestFrameLoaderGuard.result = true;
    TestFramePolicy.result = { type: 'pass' };
    TestFrameProvider.events = [];
    TestRootFrameService.backMock.mockClear();
    TestRootFrameService.openFromFrameMock.mockClear();
  });

  it('loads frame controllers and providers', async () => {
    const runtime = createFrameRuntime({
      value: 'loaded',
    });

    await runtime.load(createLoadOptions());

    expect(runtime.getLoaderData(TestFrameController)).toEqual({
      params: {
        routeId: '42',
      },
      value: 'loaded',
    });
    expect(TestFrameProvider.events).toEqual(['beforeLoad:beforeLoad', 'setup:setup', 'beforeRender:beforeRender']);
  });

  it('runs frame layout providers after frame providers', async () => {
    const runtime = createFrameRuntime(
      {
        value: 'loaded',
      },
      TestFrameWithLayout,
    );

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
    const runtime = createFrameRuntime({
      value: 'ready',
    });

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
      },
      value: 'ready:revalidated',
    });
  });

  it('opens next frame from active frame with current frame as parent', async () => {
    const runtime = createFrameRuntime({
      value: 'ready',
    });

    await runtime.load(createLoadOptions());

    await runtime.action(TestFrameController, {
      value: 'open',
    });

    expect(TestRootFrameService.openFromFrameMock).toHaveBeenCalledWith(
      {
        frameKey: 'TestFrame',
        props: {
          value: 'ready',
        },
      },
      NextTestFrame,
      {
        value: 'next',
      },
    );
  });

  it('goes back through root frame history service', async () => {
    const runtime = createFrameRuntime({
      value: 'ready',
    });

    await runtime.load(createLoadOptions());

    await runtime.action(TestFrameController, {
      value: 'back',
    });

    expect(TestRootFrameService.backMock).toHaveBeenCalledOnce();
  });

  it('blocks frame controller loader when guard rejects', async () => {
    const runtime = createFrameRuntime({
      value: 'blocked',
    });

    TestFrameLoaderGuard.result = false;

    await expect(runtime.load(createLoadOptions())).rejects.toBeInstanceOf(GuardRejectedException);
    expect(runtime.getSnapshot().phase).toBe('failed');
  });

  it('moves frame runtime to forbidden phase when activation policy fails', async () => {
    TestFramePolicy.result = {
      reason: 'denied',
      type: 'fail',
    };
    const runtime = createFrameRuntime(
      {
        value: 'blocked',
      },
      GuardedFrame,
    );

    await expect(runtime.load(createLoadOptions())).resolves.toBeUndefined();

    expect(runtime.getSnapshot()).toEqual({
      error: null,
      phase: 'forbidden',
    });
    expect(TestFrameProvider.events).toEqual([]);
  });

  it('revalidates frame loader data without recreating runtime scope', async () => {
    const runtime = createFrameRuntime({
      value: 'ready',
    });

    await runtime.load(createLoadOptions());

    TestFrameController.loaderSuffix = 'updated';

    await runtime.revalidate();

    expect(runtime.getLoaderData(TestFrameController)).toEqual({
      params: {
        routeId: '42',
      },
      value: 'ready:updated',
    });
    expect(TestFrameProvider.events.filter((event) => event === 'setup:setup')).toHaveLength(1);
  });

  it('keeps failed frame runtime available until frame dispose', async () => {
    const error = new Error('beforeRender фрейма завершился с ошибкой.');
    const runtime = createFrameRuntime({
      value: 'failed',
    });

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
    const runtime = createFrameRuntime({
      value: 'ready',
    });

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
    const runtime = createFrameRuntime({
      value: 'stale',
    });

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
    const runtime = createFrameRuntime({
      value: 'disposed',
    });

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
    const runtime = createFrameRuntime({
      value: 'ready',
    });

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
      },
      value: 'ready',
    });
  });

  it('does not reject action when session changes before action error', async () => {
    const session = new SessionRuntimeState();
    const error = new Error('Сессия фрейма устарела.');
    const runtime = createFrameRuntime({
      value: 'ready',
    });

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

  it('allows controller to close its current frame without action abort error', async () => {
    const runtime = createFrameRuntime({
      value: 'ready',
    });
    const loadOptions = createLoadOptions();
    const actionAbortController = new AbortController();

    loadOptions.close.mockImplementation(async () => {
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
    expect(loadOptions.close).toHaveBeenCalledOnce();
  });
});

interface TestFrameProps {
  readonly value: string;
}

interface TestFrameActionPayload {
  readonly value: string;
}

abstract class TestFrameLoaderGuardInterface extends GuardInterface<FrameControllerLoaderArgs<TestFrameProps>> {}

abstract class TestFramePolicyInterface extends PolicyInterface<RouteRuntimeContextInterface> {}

@Policy()
class TestFramePolicy extends TestFramePolicyInterface {
  static result: PolicyResult = { type: 'pass' };

  execute(): PolicyResult {
    return TestFramePolicy.result;
  }
}

@Injectable()
class TestFrameLoaderGuard extends TestFrameLoaderGuardInterface {
  static result = true;

  execute(): boolean {
    return TestFrameLoaderGuard.result;
  }
}

@Controller()
class TestFrameController extends FrameControllerInterface<TestFrameProps> {
  static actionHandler: (() => void) | null = null;
  static loaderSuffix = '';

  constructor(
    @Inject(RevalidateServiceInterface)
    private readonly revalidateService: RevalidateServiceInterface,
    @Inject(FrameServiceInterface)
    private readonly frameService: FrameServiceInterface,
  ) {
    super();
  }

  async action(args: FrameControllerActionArgs<TestFrameProps, TestFrameActionPayload>): Promise<{ value: string }> {
    TestFrameController.actionHandler?.();

    if (args.payload.value === 'close') {
      await this.frameService.close();

      return {
        value: `${args.props.value}:${args.payload.value}`,
      };
    }

    if (args.payload.value === 'back') {
      await this.frameService.back();

      return {
        value: `${args.props.value}:${args.payload.value}`,
      };
    }

    if (args.payload.value === 'open') {
      await this.frameService.open(NextTestFrame, {
        value: 'next',
      });

      return {
        value: `${args.props.value}:${args.payload.value}`,
      };
    }

    TestFrameController.loaderSuffix = 'revalidated';

    await this.revalidateService.revalidate();

    return {
      value: `${args.props.value}:${args.payload.value}`,
    };
  }

  @UseGuards(TestFrameLoaderGuardInterface)
  async loader(args: FrameControllerLoaderArgs<TestFrameProps>): Promise<unknown> {
    const suffix = TestFrameController.loaderSuffix ? `:${TestFrameController.loaderSuffix}` : '';

    return {
      params: args.params,
      value: `${args.props.value}${suffix}`,
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

class TestFrameBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(TestFrameController).toSelf().inSingletonScope();
    registry.bind(TestFrameLoaderGuardInterface).to(TestFrameLoaderGuard).inSingletonScope();
    registry.bind(TestFramePolicyInterface).to(TestFramePolicy).inSingletonScope();
  }
}

@UseBindings(TestFrameBindings)
@Frame<TestFrameProps>({
  providers: [TestFrameProvider],
  view: () => null,
})
class TestFrame extends FrameDefinition<TestFrameProps> {}

@Layout({
  providers: [TestFrameLayoutProvider],
  view: () => null,
})
class TestFrameLayout {}

@UseBindings(TestFrameBindings)
@Frame<TestFrameProps>({
  layouts: [TestFrameLayout],
  providers: [TestFrameProvider],
  view: () => null,
})
class TestFrameWithLayout extends FrameDefinition<TestFrameProps> {}

@UseBindings(TestFrameBindings)
@Frame<TestFrameProps>({
  canActivate: [TestFramePolicy],
  providers: [TestFrameProvider],
  view: () => null,
})
class GuardedFrame extends FrameDefinition<TestFrameProps> {}

@Frame<TestFrameProps>({
  source: HashFrameSource.create('next-test-frame'),
  view: () => null,
})
class NextTestFrame extends FrameDefinition<TestFrameProps> {}

class TestRootFrameService extends FrameServiceInterface {
  static backMock = vi.fn();
  static openFromFrameMock = vi.fn();

  async back(): Promise<void>;
  async back<TFrame extends FrameConstructor>(frame: TFrame): Promise<void>;
  async back(): Promise<void> {
    TestRootFrameService.backMock();
  }

  async close(): Promise<void>;
  async close<TFrame extends FrameConstructor>(frame: TFrame): Promise<void>;
  async close(): Promise<void> {}

  hasParent(): boolean;
  hasParent<TFrame extends FrameConstructor>(frame: TFrame): boolean;
  hasParent(): boolean {
    return false;
  }

  async open<TFrame extends FrameConstructor>(_frame: TFrame, ..._args: FrameOpenArgs<TFrame>): Promise<void> {}

  async openFromFrame<TFrame extends FrameConstructor>(
    _parentEntry: ReturnType<typeof createFrameNavigationEntry>,
    _frame: TFrame,
    ..._args: FrameOpenArgs<TFrame>
  ): Promise<void> {
    TestRootFrameService.openFromFrameMock(_parentEntry, _frame, ..._args);
  }
}

class TestRuntimeBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(FrameServiceInterface).toConstantValue(new TestRootFrameService());
  }
}

@UseBindings(TestRuntimeBindings)
class TestRuntimeOwner {}

const createFrameRuntime = (
  props: TestFrameProps,
  frame: FrameConstructor<TestFrameProps> = TestFrame,
): FrameRuntime<TestFrameProps> => {
  const scope = new ApplicationScope();

  scope.activate(TestRuntimeOwner);

  return new FrameRuntime(scope, frame, props);
};

const createLoadOptions = (session = new SessionRuntimeState()) => {
  const close = vi.fn(async () => {}) as ReturnType<typeof vi.fn> & FrameSourceCloseHandler;

  return {
    app: createApplicationController(),
    close,
    location: createLocation(),
    navigateService: createNavigateService(),
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
    },
    pathname: '/',
    search: '',
    searchParams: {},
    state: null,
  };
};

const createNavigateService = (): NavigateServiceInterface => {
  return {
    back: vi.fn(async () => {}),
    hashParams: vi.fn(async () => {}),
    replace: vi.fn(async () => {}),
    searchParams: vi.fn(async () => {}),
    to: vi.fn(async () => {}),
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
