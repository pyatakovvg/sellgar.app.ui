import { beforeEach, describe, expect, it } from 'vitest';

import type { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { UseBindings } from '../../../di/composition/use-bindings';
import { Inject } from '../../../di/injection/decorators';
import type { ProviderToken } from '../provider-token';
import {
  Provider,
  type ProviderActivateContextInterface,
  ProviderInterface,
  type ProviderInitializeContextInterface,
} from '../provider';
import { ApplicationScope } from '../../scope/kind/application-scope';
import { ModuleScope } from '../../scope/kind/module-scope';
import { ProviderPipeline, type ProviderPipelineContext } from './provider-pipeline.ts';

describe('ProviderPipeline', () => {
  beforeEach(() => {
    ApplicationLifetimeProvider.events = [];
    ApplicationLifetimeProvider.instances = 0;
    ApplicationLifetimeProvider.signals = [];
    RuntimeLifetimeProvider.instances = 0;
    RetainedLifecycleProvider.events = [];
  });

  it('keeps one provider instance through retained and focused periods', async () => {
    const applicationScope = new ApplicationScope();
    const scope = new ModuleScope(applicationScope);
    const pipeline = new ProviderPipeline(scope, [RetainedLifecycleProvider], createOwner('retained'));
    const context = createContext(scope);

    await prepareAndCommit(pipeline, context);
    expect(pipeline.isActive).toBe(true);

    await pipeline.deactivate();
    expect(pipeline.isActive).toBe(false);
    expect(RetainedLifecycleProvider.events).toEqual(['activate', 'activate.cleanup']);

    await pipeline.focus(context);
    expect(pipeline.isActive).toBe(true);
    expect(RetainedLifecycleProvider.events).toEqual(['activate', 'activate.cleanup', 'activate']);

    await pipeline.dispose();
    expect(RetainedLifecycleProvider.events).toEqual([
      'activate',
      'activate.cleanup',
      'activate',
      'activate.cleanup',
      'dispose',
    ]);

    scope.dispose();
    await applicationScope.disposeProviders();
  });

  it('shares one application-lifetime instance and activates it by reference-counted leases', async () => {
    const applicationScope = new ApplicationScope();
    const firstScope = new ModuleScope(applicationScope);
    const secondScope = new ModuleScope(applicationScope);
    const first = new ProviderPipeline(firstScope, [ApplicationLifetimeProvider], createOwner('first'));
    const second = new ProviderPipeline(secondScope, [ApplicationLifetimeProvider], createOwner('second'));
    const firstAbortController = new AbortController();
    const firstContext = createContext(firstScope, firstAbortController.signal);
    const secondContext = createContext(secondScope);

    await Promise.all([first.initialize(firstContext), second.initialize(secondContext)]);
    await Promise.all([first.prepare(firstContext), second.prepare(secondContext)]);
    await Promise.all([first.activate(firstContext), second.activate(secondContext)]);
    first.commit();
    second.commit();

    expect(ApplicationLifetimeProvider.instances).toBe(1);
    expect(ApplicationLifetimeProvider.events).toEqual(['initialize', 'activate']);
    expect(ApplicationLifetimeProvider.signals[0]).toBe(ApplicationLifetimeProvider.signals[1]);

    firstAbortController.abort();
    expect(ApplicationLifetimeProvider.signals[0]?.aborted).toBe(false);

    await first.dispose();
    expect(ApplicationLifetimeProvider.events).toEqual(['initialize', 'activate']);

    await second.dispose();
    expect(ApplicationLifetimeProvider.events).toEqual(['initialize', 'activate', 'activate.cleanup']);

    firstScope.dispose();
    secondScope.dispose();
    await applicationScope.disposeProviders();

    expect(ApplicationLifetimeProvider.signals[0]?.aborted).toBe(true);

    expect(ApplicationLifetimeProvider.events).toEqual([
      'initialize',
      'activate',
      'activate.cleanup',
      'initialize.cleanup',
      'dispose',
    ]);
  });

  it('creates independent runtime-lifetime instances for different owner pipelines', async () => {
    const applicationScope = new ApplicationScope();
    const firstScope = new ModuleScope(applicationScope);
    const secondScope = new ModuleScope(applicationScope);
    const first = new ProviderPipeline(firstScope, [RuntimeLifetimeProvider], createOwner('first'));
    const second = new ProviderPipeline(secondScope, [RuntimeLifetimeProvider], createOwner('second'));

    await prepareAndCommit(first, createContext(firstScope));
    await prepareAndCommit(second, createContext(secondScope));

    expect(RuntimeLifetimeProvider.instances).toBe(2);

    await first.dispose();
    await second.dispose();
    firstScope.dispose();
    secondScope.dispose();
    await applicationScope.disposeProviders();
  });

  it('resolves runtime provider dependencies from the owning runtime scope', async () => {
    const applicationScope = new ApplicationScope();
    const scope = new ModuleScope(applicationScope);

    scope.activate(LocalProviderOwner);

    const pipeline = new ProviderPipeline(scope, [LocalDependencyProvider], createOwner('local-provider'));

    expect(LocalDependencyProvider.resolvedValue).toBe('owner-local');

    await pipeline.dispose();
    scope.dispose();
    await applicationScope.disposeProviders();
  });

  it('tracks activation even when activate does not return a cleanup', async () => {
    const applicationScope = new ApplicationScope();
    const scope = new ModuleScope(applicationScope);
    const pipeline = new ProviderPipeline(scope, [RuntimeLifetimeProvider], createOwner('active'));
    const context = createContext(scope);

    await prepareAndCommit(pipeline, context);
    await expect(pipeline.prepare(context)).rejects.toThrow('Активный ProviderPipeline нельзя повторно подготовить');

    await pipeline.deactivate();
    await pipeline.prepare(context);
    await pipeline.activate(context);
    pipeline.commit();

    await pipeline.dispose();
    scope.dispose();
    await applicationScope.disposeProviders();
  });

  it('waits for every concurrent prepare before cleaning a failed candidate', async () => {
    const applicationScope = new ApplicationScope();
    const scope = new ModuleScope(applicationScope);
    const deferred = createDeferred<void>();

    SlowPrepareProvider.deferred = deferred;
    SlowPrepareProvider.cleanupCount = 0;
    const pipeline = new ProviderPipeline(
      scope,
      [SlowPrepareProvider, FailingPrepareProvider],
      createOwner('candidate'),
    );
    const context = createContext(scope);

    await pipeline.initialize(context);
    const preparation = pipeline.prepare(context);
    let settled = false;

    void preparation.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    deferred.resolve();
    await expect(preparation).rejects.toThrow('prepare failed');
    expect(SlowPrepareProvider.cleanupCount).toBe(1);

    await pipeline.dispose();
    scope.dispose();
    await applicationScope.disposeProviders();
  });

  it('waits for an in-flight preparation before discarding its cleanup', async () => {
    const applicationScope = new ApplicationScope();
    const scope = new ModuleScope(applicationScope);
    const deferred = createDeferred<void>();

    SlowPrepareProvider.deferred = deferred;
    SlowPrepareProvider.cleanupCount = 0;
    const pipeline = new ProviderPipeline(scope, [SlowPrepareProvider], createOwner('discard'));
    const preparation = pipeline.prepare(createContext(scope));
    const discard = pipeline.discard();

    deferred.resolve();
    await Promise.all([preparation, discard]);

    expect(SlowPrepareProvider.cleanupCount).toBe(1);
    await pipeline.dispose();
    expect(SlowPrepareProvider.cleanupCount).toBe(1);

    scope.dispose();
    await applicationScope.disposeProviders();
  });

  it('rejects hooks unavailable for application lifetime', () => {
    const applicationScope = new ApplicationScope();
    const scope = new ModuleScope(applicationScope);

    expect(() => new ProviderPipeline(scope, [UnsupportedApplicationProvider], createOwner('invalid'))).toThrow(
      'lifetime "application" не может реализовывать prepare()',
    );
    expect(
      () => new ProviderPipeline(scope, [UnsupportedApplicationRevalidationProvider], createOwner('invalid')),
    ).toThrow('lifetime "application" не может реализовывать revalidate()');

    scope.dispose();
  });

  it('rejects a provider without mandatory dispose', () => {
    const applicationScope = new ApplicationScope();
    const scope = new ModuleScope(applicationScope);
    const token = MissingDisposeProvider as unknown as ProviderToken;

    expect(() => new ProviderPipeline(scope, [token], createOwner('invalid'))).toThrow(
      'должен реализовать обязательный dispose()',
    );

    scope.dispose();
  });
});

const prepareAndCommit = async (pipeline: ProviderPipeline, context: ProviderPipelineContext): Promise<void> => {
  await pipeline.initialize(context);
  await pipeline.prepare(context);
  await pipeline.activate(context);
  pipeline.commit();
};

const createContext = (
  scope: ModuleScope,
  signal: AbortSignal = new AbortController().signal,
): ProviderPipelineContext => ({
  params: {},
  props: {},
  scope,
  signal,
});

const createOwner = (name: string) => ({ kind: 'module' as const, token: Symbol(name) });

@Provider({ lifetime: 'application' })
class ApplicationLifetimeProvider implements ProviderInterface {
  static events: string[] = [];
  static instances = 0;
  static signals: AbortSignal[] = [];

  constructor() {
    ApplicationLifetimeProvider.instances++;
  }

  initialize(context: ProviderInitializeContextInterface): () => void {
    ApplicationLifetimeProvider.events.push('initialize');
    ApplicationLifetimeProvider.signals.push(context.signal);
    return () => ApplicationLifetimeProvider.events.push('initialize.cleanup');
  }

  activate(context: ProviderActivateContextInterface): () => void {
    ApplicationLifetimeProvider.events.push('activate');
    ApplicationLifetimeProvider.signals.push(context.signal);
    return () => ApplicationLifetimeProvider.events.push('activate.cleanup');
  }

  dispose(): void {
    ApplicationLifetimeProvider.events.push('dispose');
  }
}

@Provider()
class RuntimeLifetimeProvider implements ProviderInterface {
  static instances = 0;

  constructor() {
    RuntimeLifetimeProvider.instances++;
  }

  dispose(): void {}
}

@Provider()
class RetainedLifecycleProvider implements ProviderInterface {
  static events: string[] = [];

  activate(): () => void {
    RetainedLifecycleProvider.events.push('activate');
    return () => RetainedLifecycleProvider.events.push('activate.cleanup');
  }

  dispose(): void {
    RetainedLifecycleProvider.events.push('dispose');
  }
}

abstract class LocalDependency {
  abstract readonly value: string;
}

class LocalProviderBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(LocalDependency).toConstantValue({ value: 'owner-local' });
  }
}

@UseBindings(LocalProviderBindings)
class LocalProviderOwner {}

@Provider()
class LocalDependencyProvider implements ProviderInterface {
  static resolvedValue: string | undefined;

  constructor(@Inject(LocalDependency) dependency: LocalDependency) {
    LocalDependencyProvider.resolvedValue = dependency.value;
  }

  dispose(): void {}
}

@Provider()
class SlowPrepareProvider implements ProviderInterface {
  static cleanupCount = 0;
  static deferred: Deferred<void>;

  async prepare(): Promise<() => void> {
    await SlowPrepareProvider.deferred.promise;
    return () => SlowPrepareProvider.cleanupCount++;
  }

  dispose(): void {}
}

@Provider()
class FailingPrepareProvider implements ProviderInterface {
  prepare(): never {
    throw new Error('prepare failed');
  }

  dispose(): void {}
}

@Provider({ lifetime: 'application' })
class UnsupportedApplicationProvider implements ProviderInterface {
  prepare(): void {}
  dispose(): void {}
}

@Provider({ lifetime: 'application' })
class UnsupportedApplicationRevalidationProvider implements ProviderInterface {
  revalidate(): void {}
  dispose(): void {}
}

@Provider()
class MissingDisposeProvider {}

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
