import 'reflect-metadata';

import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Controller } from '../../../controller/contract/controller';

import { SessionRuntimeState } from '../../../application/session/session-runtime-state';
import { BindingModuleInterface } from '../../../di/binding/binding-module';
import { Inject, Injectable } from '../../../di/injection/decorators';
import { UseBindings } from '../../../di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { GuardInterface } from '../../../guard/contract/guard';
import { GuardRejectedException } from '../../../guard/contract/guard-rejected-exception';
import { UseGuards } from '../../../guard/declaration/use-guards';
import { ApplicationScope } from '../../../runtime/scope/kind';
import { Provider, RuntimeProviderInterface } from '../../../runtime/provider/runtime-provider';
import type {
  RuntimeProviderContextInterface,
  RuntimeProviderResult,
} from '../../../runtime/provider/runtime-provider';

import { Widget, WidgetDefinition } from '../../declaration/widget';

import {
  WidgetControllerInterface,
  type WidgetControllerActionArgs,
  type WidgetControllerLoaderArgs,
} from '../widget-controller';
import { RevalidateServiceInterface } from '../../../revalidate/contract/revalidate-service';
import { WidgetRuntime } from './';

describe('WidgetRuntime', () => {
  it('loads widget controllers and providers', async () => {
    resetWidgetTestState();

    const runtime = createWidgetRuntime({
      value: 'ready',
    });
    const listener = vi.fn();

    runtime.subscribe(listener);

    await runtime.load();

    expect(runtime.getSnapshot()).toEqual({
      error: null,
      phase: 'ready',
    });
    expect(runtime.getLoaderData(TestWidgetController)).toBe('ready');
    expect(TestWidgetProvider.events).toEqual(['beforeLoad:ready', 'setup:ready', 'beforeRender:ready']);
    expect(listener).toHaveBeenCalledTimes(2);

    await runtime.dispose();

    expect(runtime.getSnapshot().phase).toBe('disposed');
    expect(TestWidgetController.disposeCount).toBe(1);
    expect(TestWidgetProvider.events).toContain('dispose');
  });

  it('runs widget controller action with payload and props', async () => {
    resetWidgetTestState();

    const runtime = createWidgetRuntime({
      value: 'ready',
    });

    await runtime.load();

    const result = await runtime.action(TestWidgetController, {
      suffix: 'submitted',
    });

    expect(result).toEqual({
      value: 'ready:submitted',
    });
  });

  it('blocks widget controller action when guard rejects', async () => {
    resetWidgetTestState();

    const runtime = createWidgetRuntime({
      value: 'ready',
    });

    TestWidgetActionGuard.result = false;
    TestWidgetController.actionHandler = vi.fn();
    await runtime.load();

    await expect(
      runtime.action(TestWidgetController, {
        suffix: 'submitted',
      }),
    ).rejects.toBeInstanceOf(GuardRejectedException);
    expect(TestWidgetController.actionHandler).not.toHaveBeenCalled();
  });

  it('revalidates widget controller loader data in current runtime', async () => {
    resetWidgetTestState();

    const runtime = createWidgetRuntime({
      value: 'ready',
    });
    const listener = vi.fn();

    runtime.subscribe(listener);
    await runtime.load();
    runtime.setProps({
      value: 'updated',
    });

    await runtime.revalidate();

    expect(runtime.getLoaderData(TestWidgetController)).toBe('updated');
    expect(TestWidgetProvider.events).toEqual([
      'beforeLoad:ready',
      'setup:ready',
      'beforeRender:ready',
      'beforeLoad:updated',
      'beforeRender:updated',
    ]);
    expect(listener).toHaveBeenCalledTimes(5);
  });

  it('allows widget controller to revalidate its runtime through service', async () => {
    resetWidgetTestState();

    const runtime = createWidgetRuntime({
      value: 'ready',
    });

    await runtime.load();
    runtime.setProps({
      value: 'updated',
    });

    const result = await runtime.action(TestWidgetController, {
      suffix: 'revalidate',
    });

    expect(result).toEqual({
      value: 'updated:revalidate',
    });
    expect(runtime.getLoaderData(TestWidgetController)).toBe('updated');
  });

  it('keeps widget ready when revalidation fails', async () => {
    resetWidgetTestState();

    const runtime = createWidgetRuntime({
      value: 'ready',
    });

    await runtime.load();
    runtime.setProps({
      value: 'fail',
    });

    await expect(runtime.revalidate()).rejects.toThrow('Загрузка виджета завершилась с ошибкой.');

    expect(runtime.getSnapshot().phase).toBe('ready');
    expect(runtime.getLoaderData(TestWidgetController)).toBe('ready');
  });

  it('keeps widget ready when session changes before revalidation error', async () => {
    resetWidgetTestState();

    const session = new SessionRuntimeState();
    const runtime = createWidgetRuntime(
      {
        value: 'ready',
      },
      session,
    );

    session.setAuthenticated();
    await runtime.load();
    runtime.setProps({
      value: 'fail',
    });
    TestWidgetController.loaderHandler = () => {
      session.setAnonymous();
    };

    await expect(runtime.revalidate()).resolves.toBeUndefined();

    expect(runtime.getSnapshot().phase).toBe('ready');
    expect(runtime.getLoaderData(TestWidgetController)).toBe('ready');
  });

  it('moves loading widget back to idle when session changes before loader error', async () => {
    resetWidgetTestState();

    const session = new SessionRuntimeState();
    const runtime = createWidgetRuntime(
      {
        value: 'fail',
      },
      session,
    );

    session.setAuthenticated();
    TestWidgetController.loaderHandler = () => {
      session.setAnonymous();
    };

    await expect(runtime.load()).resolves.toBeUndefined();

    expect(runtime.getSnapshot()).toEqual({
      error: null,
      phase: 'idle',
    });
  });

  it('does not reject action when session changes before action error', async () => {
    resetWidgetTestState();

    const session = new SessionRuntimeState();
    const runtime = createWidgetRuntime(
      {
        value: 'ready',
      },
      session,
    );

    session.setAuthenticated();
    await runtime.load();
    TestWidgetController.actionHandler = () => {
      session.setAnonymous();
      throw new Error('Сессия виджета устарела.');
    };

    await expect(
      runtime.action(TestWidgetController, {
        suffix: 'submitted',
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects when widget controller action is not available', async () => {
    resetWidgetTestState();

    const runtime = createWidgetRuntime({
      value: 'ready',
    });

    await runtime.load();

    await expect(runtime.action(TestWidgetWithoutActionController, {})).rejects.toThrow(
      'Действие контроллера виджета недоступно.',
    );
  });

  it('moves to failed when loader rejects', async () => {
    resetWidgetTestState();

    const runtime = createWidgetRuntime({
      value: 'fail',
    });

    await expect(runtime.load()).rejects.toThrow('Загрузка виджета завершилась с ошибкой.');

    expect(runtime.getSnapshot().phase).toBe('failed');
    expect(runtime.getSnapshot().error).toBeInstanceOf(Error);
  });

  it('moves to failed when widget runtime creation rejects', async () => {
    resetWidgetTestState();

    TestWidgetController.constructorError = new Error('Создание runtime виджета завершилось с ошибкой.');

    const runtime = createWidgetRuntime({ value: 'ready' });

    await expect(runtime.load()).rejects.toBe(TestWidgetController.constructorError);
    expect(runtime.getSnapshot()).toEqual({
      error: TestWidgetController.constructorError,
      phase: 'failed',
    });
  });

  it('keeps a render failure terminal when load is requested afterwards', async () => {
    resetWidgetTestState();

    const error = new Error('Рендеринг view виджета завершился с ошибкой.');
    const runtime = createWidgetRuntime({
      value: 'ready',
    });

    await runtime.failRender(error);
    await runtime.load();

    expect(runtime.getSnapshot()).toEqual({
      error,
      phase: 'failed',
    });
    expect(TestWidgetProvider.events).toEqual([]);
  });

  it('does not apply stale load completion after dispose', async () => {
    resetWidgetTestState();

    const deferred = createDeferred<void>();
    TestWidgetController.deferred = deferred;

    const runtime = createWidgetRuntime({
      value: 'delayed',
    });
    const loadPromise = runtime.load();

    expect(runtime.getSnapshot().phase).toBe('loading');

    await runtime.dispose();
    deferred.resolve();
    await expect(loadPromise).resolves.toBeUndefined();

    expect(runtime.getSnapshot()).toEqual({
      error: null,
      phase: 'disposed',
    });
  });
});

const createWidgetRuntime = (
  props: TestWidgetProps,
  session: SessionRuntimeState | null = null,
): WidgetRuntime<TestWidgetProps> => {
  return new WidgetRuntime(new ApplicationScope(), TestWidget, props, session);
};

const resetWidgetTestState = (): void => {
  TestWidgetController.actionHandler = null;
  TestWidgetController.constructorError = null;
  TestWidgetController.deferred = null;
  TestWidgetController.disposeCount = 0;
  TestWidgetController.loaderHandler = null;
  TestWidgetActionGuard.result = true;
  TestWidgetProvider.events = [];
};

interface TestWidgetProps {
  readonly value: string;
}

interface TestWidgetActionPayload {
  readonly suffix: string;
}

interface TestWidgetActionResult {
  readonly value: string;
}

abstract class TestWidgetActionGuardInterface extends GuardInterface<
  WidgetControllerActionArgs<TestWidgetProps, TestWidgetActionPayload>
> {}

@Injectable()
class TestWidgetActionGuard extends TestWidgetActionGuardInterface {
  static result = true;

  execute(): boolean {
    return TestWidgetActionGuard.result;
  }
}

@Controller()
class TestWidgetController extends WidgetControllerInterface<TestWidgetProps> {
  static actionHandler: (() => void) | null = null;
  static constructorError: Error | null = null;
  static deferred: Deferred<void> | null = null;
  static disposeCount = 0;
  static loaderHandler: (() => void) | null = null;

  constructor(
    @Inject(RevalidateServiceInterface)
    private readonly revalidateService: RevalidateServiceInterface,
  ) {
    super();

    if (TestWidgetController.constructorError) {
      throw TestWidgetController.constructorError;
    }
  }

  async loader(args: WidgetControllerLoaderArgs<TestWidgetProps>): Promise<string> {
    await TestWidgetController.deferred?.promise;
    TestWidgetController.loaderHandler?.();

    if (args.props.value === 'fail') {
      throw new Error('Загрузка виджета завершилась с ошибкой.');
    }

    return args.props.value;
  }

  @UseGuards(TestWidgetActionGuardInterface)
  async action(
    args: WidgetControllerActionArgs<TestWidgetProps, TestWidgetActionPayload>,
  ): Promise<TestWidgetActionResult> {
    TestWidgetController.actionHandler?.();

    if (args.payload.suffix === 'revalidate') {
      await this.revalidateService.revalidate();
    }

    return {
      value: `${args.props.value}:${args.payload.suffix}`,
    };
  }

  dispose(): void {
    TestWidgetController.disposeCount++;
  }
}

@Controller()
class TestWidgetWithoutActionController extends WidgetControllerInterface<TestWidgetProps> {}

@Provider()
class TestWidgetProvider extends RuntimeProviderInterface<TestWidgetProps> {
  static events: string[] = [];

  setup({ props }: RuntimeProviderContextInterface<TestWidgetProps>): RuntimeProviderResult {
    TestWidgetProvider.events.push(`setup:${props.value}`);

    return () => {
      TestWidgetProvider.events.push('dispose');
    };
  }

  beforeLoad({ props }: RuntimeProviderContextInterface<TestWidgetProps>): void {
    TestWidgetProvider.events.push(`beforeLoad:${props.value}`);
  }

  beforeRender({ props }: RuntimeProviderContextInterface<TestWidgetProps>): void {
    TestWidgetProvider.events.push(`beforeRender:${props.value}`);
  }
}

class TestWidgetBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(TestWidgetController).toSelf().inSingletonScope();
    registry.bind(TestWidgetActionGuardInterface).to(TestWidgetActionGuard).inSingletonScope();
    registry.bind(TestWidgetWithoutActionController).toSelf().inSingletonScope();
  }
}

@UseBindings(TestWidgetBindings)
@Widget({
  providers: [TestWidgetProvider],
  view: () => React.createElement('div'),
})
class TestWidget extends WidgetDefinition<TestWidgetProps> {}

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  readonly resolve: (value: TValue) => void;
}

const createDeferred = <TValue>(): Deferred<TValue> => {
  let resolveValue: (value: TValue) => void = () => void 0;
  const promise = new Promise<TValue>((resolve) => {
    resolveValue = resolve;
  });

  return {
    promise,
    resolve: resolveValue,
  };
};
