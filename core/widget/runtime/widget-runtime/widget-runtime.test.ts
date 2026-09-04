import { beforeEach, describe, expect, it } from 'vitest';

import { RequestExecutorInterface } from '../../../application/request/request-executor';
import { SessionRuntimeState, SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import type { ControllerArgs, WithPayload, WithProps } from '../../../controller/contract/controller';
import { Controller } from '../../../controller/contract/controller';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { BindingModuleInterface } from '../../../di/binding/binding-module';
import { UseBindings } from '../../../di/composition/use-bindings';
import { Inject } from '../../../di/injection/decorators';
import { UnauthorizedException } from '../../../http/exception/http-exception';
import {
  Provider,
  ProviderInterface,
  type ProviderPrepareContextInterface,
  type ProviderRevalidationContextInterface,
} from '../../../runtime/provider/provider';
import { ApplicationScope } from '../../../runtime/scope/kind/application-scope';
import {
  WidgetDefinition,
  configureWidgetRuntimeDefinition,
  getWidgetRuntimeDefinition,
} from '../../declaration/widget';
import { WidgetRuntime } from './widget-runtime.ts';

describe('WidgetRuntime', () => {
  beforeEach(() => {
    TestController.actionDeferred = null;
    TestController.authenticateSessionOnAction = false;
    TestController.completedAfterSessionTransition = false;
    TestController.expireSessionOnAction = false;
    TestController.disposeCount = 0;
    TestController.loadCount = 0;
    TestController.loaderDeferred = null;
    TestProvider.events = [];
  });

  it('keeps the load props snapshot and uses the latest accepted props in the next operation', async () => {
    const deferred = createDeferred<void>();
    const runtime = createRuntime({ value: 'initial' });

    TestController.loaderDeferred = deferred;
    const load = runtime.load();

    await waitFor(() => TestController.loadCount === 1);
    runtime.updateProps({ value: 'updated' });
    deferred.resolve();
    await load;

    expect(runtime.getLoaderData(TestController)).toBe('initial');

    TestController.loaderDeferred = null;
    await runtime.revalidate();

    expect(runtime.getLoaderData(TestController)).toBe('updated');
    expect(TestProvider.events).toEqual(['initialize', 'prepare:initial', 'activate', 'revalidate:updated']);
  });

  it('captures props independently for each action', async () => {
    const deferred = createDeferred<void>();
    const runtime = createRuntime({ value: 'first' });

    await runtime.load();
    TestController.actionDeferred = deferred;

    const action = runtime.action(TestController, { suffix: 'submitted' });

    runtime.updateProps({ value: 'second' });
    deferred.resolve();

    await expect(action).resolves.toEqual({ value: 'first:submitted' });

    TestController.actionDeferred = null;
    await expect(runtime.action(TestController, { suffix: 'next' })).resolves.toEqual({
      value: 'second:next',
    });
  });

  it('completes an active action when its protected request expires the session', async () => {
    const session = new SessionRuntimeState();
    const runtime = createRuntime({ value: 'ready' }, session);

    session.setAuthenticated();
    await runtime.load();
    TestController.expireSessionOnAction = true;

    await expect(runtime.action(TestController, { suffix: 'submitted' })).resolves.toBeUndefined();

    expect(session.phase).toBe('anonymous');
    expect(runtime.getActionState(TestController)).toEqual({
      data: undefined,
      error: undefined,
      inProcess: false,
    });
  });

  it('lets an authentication action finish before discarding its stale result', async () => {
    const session = new SessionRuntimeState();
    const runtime = createRuntime({ value: 'ready' }, session);

    session.setAnonymous();
    await runtime.load();
    TestController.authenticateSessionOnAction = true;

    await expect(runtime.action(TestController, { suffix: 'submitted' })).resolves.toBeUndefined();

    expect(TestController.completedAfterSessionTransition).toBe(true);
    expect(session.phase).toBe('authenticated');
    expect(runtime.getActionState(TestController)).toEqual({
      data: undefined,
      error: undefined,
      inProcess: false,
    });
  });

  it('does not apply a superseded revalidation result', async () => {
    const deferred = createDeferred<void>();
    const runtime = createRuntime({ value: 'initial' });

    await runtime.load();
    runtime.updateProps({ value: 'superseded' });
    TestController.loaderDeferred = deferred;

    const superseded = runtime.revalidate();

    await waitFor(() => TestController.loadCount === 2);
    runtime.updateProps({ value: 'latest' });
    TestController.loaderDeferred = null;
    const latest = runtime.revalidate();

    deferred.resolve();
    await Promise.all([superseded, latest]);

    expect(runtime.getLoaderData(TestController)).toBe('latest');
  });

  it('attributes general and targeted revalidation processes independently', async () => {
    const deferred = createDeferred<void>();
    const runtime = createRuntime({ value: 'ready' });

    await runtime.load();
    TestController.loaderDeferred = deferred;

    const general = runtime.revalidate();

    await waitFor(() => TestController.loadCount === 2);

    expect(runtime.getRevalidateState()).toEqual({ error: undefined, inProcess: true });
    expect(runtime.getRevalidateState(TestController)).toEqual({ error: undefined, inProcess: false });
    expect(runtime.getRevalidateState(OtherController)).toEqual({ error: undefined, inProcess: false });

    deferred.resolve();
    await general;

    const targetedDeferred = createDeferred<void>();

    TestController.loaderDeferred = targetedDeferred;

    const targeted = runtime.revalidate({ controllerToken: TestController });

    await waitFor(() => TestController.loadCount === 3);

    expect(runtime.getRevalidateState()).toEqual({ error: undefined, inProcess: true });
    expect(runtime.getRevalidateState(TestController)).toEqual({ error: undefined, inProcess: true });
    expect(runtime.getRevalidateState(OtherController)).toEqual({ error: undefined, inProcess: false });

    targetedDeferred.resolve();
    await targeted;
  });

  it('cleans controllers and providers exactly once', async () => {
    const runtime = createRuntime({ value: 'ready' });

    await runtime.load();
    await runtime.dispose();
    await runtime.dispose();

    expect(runtime.getSnapshot()).toEqual({ error: null, phase: 'disposed' });
    expect(TestController.disposeCount).toBe(1);
    expect(TestProvider.events).toEqual([
      'initialize',
      'prepare:ready',
      'activate',
      'activate.cleanup',
      'prepare.cleanup:ready',
      'initialize.cleanup',
      'dispose',
    ]);
  });
});

const createRuntime = (
  props: TestWidgetProps,
  session: SessionRuntimeState = new SessionRuntimeState(),
): WidgetRuntime<TestWidgetProps> => {
  const scope = new ApplicationScope();

  scope.bindSession(session);

  return new WidgetRuntime(scope, getWidgetRuntimeDefinition(TestWidget), props);
};

interface TestWidgetProps {
  readonly value: string;
}

interface TestActionPayload {
  readonly suffix: string;
}

@Controller()
class TestController {
  static actionDeferred: Deferred<void> | null = null;
  static authenticateSessionOnAction = false;
  static completedAfterSessionTransition = false;
  static disposeCount = 0;
  static expireSessionOnAction = false;
  static loadCount = 0;
  static loaderDeferred: Deferred<void> | null = null;

  constructor(
    @Inject(RequestExecutorInterface)
    private readonly requests: RequestExecutorInterface,
    @Inject(SessionRuntimeStateInterface)
    private readonly session: SessionRuntimeStateInterface,
  ) {}

  async loader(args: ControllerArgs<WithProps<TestWidgetProps>>): Promise<string> {
    TestController.loadCount++;
    const deferred = TestController.loaderDeferred;

    await deferred?.promise;

    return args.props.value;
  }

  async action(
    args: ControllerArgs<WithPayload<TestActionPayload, WithProps<TestWidgetProps>>>,
  ): Promise<{ readonly value: string }> {
    if (TestController.authenticateSessionOnAction) {
      this.session.setAuthenticated();
      TestController.completedAfterSessionTransition = true;

      return { value: `${args.props.value}:${args.payload.suffix}` };
    }

    if (TestController.expireSessionOnAction) {
      return await this.requests.run(() => Promise.reject(new UnauthorizedException({ title: 'Session expired' })));
    }

    const deferred = TestController.actionDeferred;

    await deferred?.promise;

    return { value: `${args.props.value}:${args.payload.suffix}` };
  }

  dispose(): void {
    TestController.disposeCount++;
  }
}

class OtherController {}

@Provider()
class TestProvider implements ProviderInterface<TestWidgetProps> {
  static events: string[] = [];

  initialize(): () => void {
    TestProvider.events.push('initialize');

    return () => TestProvider.events.push('initialize.cleanup');
  }

  prepare(context: ProviderPrepareContextInterface<TestWidgetProps>): () => void {
    const value = context.props.value;

    TestProvider.events.push(`prepare:${value}`);

    return () => TestProvider.events.push(`prepare.cleanup:${value}`);
  }

  activate(): () => void {
    TestProvider.events.push('activate');

    return () => TestProvider.events.push('activate.cleanup');
  }

  revalidate(context: ProviderRevalidationContextInterface<TestWidgetProps>): void {
    TestProvider.events.push(`revalidate:${context.props.value}`);
  }

  dispose(): void {
    TestProvider.events.push('dispose');
  }
}

class TestBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(TestController).toSelf().inSingletonScope();
  }
}

@UseBindings(TestBindings)
class TestWidget extends WidgetDefinition<TestWidgetProps> {}

configureWidgetRuntimeDefinition(TestWidget, {
  providers: [TestProvider],
});

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  readonly resolve: (value: TValue) => void;
}

const createDeferred = <TValue>(): Deferred<TValue> => {
  let resolveValue: (value: TValue) => void = () => undefined;
  const promise = new Promise<TValue>((resolve) => {
    resolveValue = resolve;
  });

  return { promise, resolve: resolveValue };
};

const waitFor = async (predicate: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) {
      return;
    }

    await Promise.resolve();
  }

  throw new Error('Ожидаемое состояние теста не достигнуто.');
};
