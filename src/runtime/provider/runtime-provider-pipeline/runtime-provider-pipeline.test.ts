import 'reflect-metadata';

import { beforeEach, describe, expect, it } from 'vitest';

import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { UseBindings } from '../../../di/composition/use-bindings';
import { Inject, Injectable } from '../../../di/injection/decorators';
import { ApplicationScope, FrameScope, ModuleScope, ProviderScope, WidgetScope } from '../../scope/kind';
import {
  Provider,
  RuntimeProviderInterface,
  type RuntimeProviderContextInterface,
  type RuntimeProviderResult,
} from '../runtime-provider';
import { SingletonProvider, SingletonProviderInterface } from '../singleton-provider';
import { captureRuntimeFailure, type RuntimeOwner } from '../../failure';

import { RuntimeProviderPipeline } from './runtime-provider-pipeline';

const TEST_OWNER = { kind: 'application' as const };

describe('RuntimeProviderPipeline', () => {
  beforeEach(() => {
    ProviderBindings.registerCount = 0;
    TestProvider.constructorDependencies = [];
    TestProvider.contexts = [];
    TestProvider.disposeBindingStates = [];
    TestProvider.providerScope = undefined;
    OtherProvider.constructorDependencies = [];
    OtherProvider.contexts = [];
    OtherProvider.disposeBindingStates = [];
    OtherProvider.providerScope = undefined;
    TestPreloadService.contexts = [];
    TestSetupProvider.cleanupCount = 0;
    TestSetupProvider.setupCount = 0;
    TestSingletonProvider.cleanupCount = 0;
    TestSingletonProvider.constructorCount = 0;
    TestSingletonProvider.setupCount = 0;
    FailingSingletonProvider.cleanupCount = 0;
    FailingSingletonProvider.setupCount = 0;
  });

  it('runs setup once for the runtime pipeline and cleans it up on dispose', async () => {
    const applicationScope = createApplicationScope();
    const moduleScope = new ModuleScope(applicationScope);
    const pipeline = new RuntimeProviderPipeline(moduleScope, [TestSetupProvider], TEST_OWNER);
    const context = createContext(moduleScope);

    await pipeline.setup(context);
    await pipeline.setup(context);
    await pipeline.runBeforeRender(context);

    expect(TestSetupProvider.setupCount).toBe(1);
    expect(TestSetupProvider.cleanupCount).toBe(0);

    await pipeline.dispose();
    await pipeline.dispose();

    expect(TestSetupProvider.cleanupCount).toBe(1);

    moduleScope.dispose();
    applicationScope.dispose();
  });

  it('shares provider dependencies but creates a provider instance for every runtime pipeline', async () => {
    const applicationScope = createApplicationScope();
    const providerScope = applicationScope.get(ProviderScope);
    const moduleScope = new ModuleScope(applicationScope);
    const frameScope = new FrameScope(applicationScope);
    const widgetScope = new WidgetScope(applicationScope);

    TestProvider.providerScope = providerScope;
    OtherProvider.providerScope = providerScope;

    const modulePipeline = new RuntimeProviderPipeline(moduleScope, [TestProvider], TEST_OWNER);
    const framePipeline = new RuntimeProviderPipeline(frameScope, [TestProvider], TEST_OWNER);
    const widgetPipeline = new RuntimeProviderPipeline(widgetScope, [OtherProvider], TEST_OWNER);

    await modulePipeline.runBeforeRender(createContext(moduleScope));
    await framePipeline.runBeforeRender(createContext(frameScope));
    await widgetPipeline.runBeforeRender(createContext(widgetScope));

    expect(ProviderBindings.registerCount).toBe(1);
    expect(TestProvider.constructorDependencies).toHaveLength(2);
    expect(OtherProvider.constructorDependencies).toHaveLength(1);
    expect(new Set([...TestProvider.constructorDependencies, ...OtherProvider.constructorDependencies]).size).toBe(1);
    expect([...TestProvider.contexts, ...OtherProvider.contexts].map(({ scope }) => scope)).toEqual([
      moduleScope,
      frameScope,
      widgetScope,
    ]);
    expect(TestPreloadService.contexts.map(({ scope }) => scope)).toEqual([moduleScope, frameScope, widgetScope]);

    await modulePipeline.dispose();
    expect(providerScope.has(ProviderDependencyInterface)).toBe(true);

    await framePipeline.dispose();
    expect(providerScope.has(ProviderDependencyInterface)).toBe(true);

    await widgetPipeline.dispose();
    expect(providerScope.has(ProviderDependencyInterface)).toBe(false);
    expect([...TestProvider.disposeBindingStates, ...OtherProvider.disposeBindingStates]).toEqual([true, true, true]);

    moduleScope.dispose();
    frameScope.dispose();
    widgetScope.dispose();
    applicationScope.dispose();
  });

  it('shares one singleton provider setup across active runtime pipelines', async () => {
    const applicationScope = createApplicationScope();
    const moduleScope = new ModuleScope(applicationScope);
    const frameScope = new FrameScope(applicationScope);
    const modulePipeline = new RuntimeProviderPipeline(moduleScope, [TestSingletonProvider], TEST_OWNER);
    const framePipeline = new RuntimeProviderPipeline(frameScope, [TestSingletonProvider], TEST_OWNER);

    expect(TestSingletonProvider.constructorCount).toBe(1);

    await Promise.all([
      modulePipeline.setup(createContext(moduleScope)),
      framePipeline.setup(createContext(frameScope)),
    ]);

    expect(TestSingletonProvider.setupCount).toBe(1);

    await modulePipeline.dispose();

    expect(TestSingletonProvider.cleanupCount).toBe(0);

    await framePipeline.dispose();

    expect(TestSingletonProvider.cleanupCount).toBe(1);

    const widgetScope = new WidgetScope(applicationScope);
    const widgetPipeline = new RuntimeProviderPipeline(widgetScope, [TestSingletonProvider], TEST_OWNER);

    await widgetPipeline.setup(createContext(widgetScope));

    expect(TestSingletonProvider.constructorCount).toBe(1);
    expect(TestSingletonProvider.setupCount).toBe(2);

    await widgetPipeline.dispose();

    expect(TestSingletonProvider.cleanupCount).toBe(2);

    moduleScope.dispose();
    frameScope.dispose();
    widgetScope.dispose();
    applicationScope.dispose();
  });

  it('shares singleton setup failure without retrying during lease disposal', async () => {
    const applicationScope = createApplicationScope();
    const moduleScope = new ModuleScope(applicationScope);
    const frameScope = new FrameScope(applicationScope);
    const modulePipeline = new RuntimeProviderPipeline(moduleScope, [FailingSingletonProvider], TEST_OWNER);
    const framePipeline = new RuntimeProviderPipeline(frameScope, [FailingSingletonProvider], TEST_OWNER);

    await expect(
      Promise.all([modulePipeline.setup(createContext(moduleScope)), framePipeline.setup(createContext(frameScope))]),
    ).rejects.toThrow('Singleton setup failed.');

    expect(FailingSingletonProvider.setupCount).toBe(1);

    await Promise.all([modulePipeline.dispose(), framePipeline.dispose()]);

    expect(FailingSingletonProvider.setupCount).toBe(1);
    expect(FailingSingletonProvider.cleanupCount).toBe(0);

    const widgetScope = new WidgetScope(applicationScope);
    const widgetPipeline = new RuntimeProviderPipeline(widgetScope, [FailingSingletonProvider], TEST_OWNER);

    await widgetPipeline.setup(createContext(widgetScope));
    await widgetPipeline.dispose();

    expect(FailingSingletonProvider.setupCount).toBe(2);
    expect(FailingSingletonProvider.cleanupCount).toBe(1);

    moduleScope.dispose();
    frameScope.dispose();
    widgetScope.dispose();
    applicationScope.dispose();
  });

  it('acquires a duplicated provider token only once', async () => {
    const applicationScope = createApplicationScope();
    const moduleScope = new ModuleScope(applicationScope);
    const pipeline = new RuntimeProviderPipeline(moduleScope, [TestProvider, TestProvider], TEST_OWNER);

    expect(pipeline.size).toBe(1);
    expect(TestProvider.constructorDependencies).toHaveLength(1);

    await pipeline.dispose();
    moduleScope.dispose();
    applicationScope.dispose();
  });

  it('rolls back earlier provider acquisitions when a later provider cannot be resolved', () => {
    const applicationScope = createApplicationScope();
    const providerScope = applicationScope.get(ProviderScope);
    const moduleScope = new ModuleScope(applicationScope);

    expect(() => new RuntimeProviderPipeline(moduleScope, [TestProvider, FailingProvider], TEST_OWNER)).toThrow(
      'Provider construction failed.',
    );
    expect(providerScope.has(ProviderDependencyInterface)).toBe(false);

    moduleScope.dispose();
    applicationScope.dispose();
  });

  it('attributes blocking provider failure to the pipeline owner', async () => {
    const applicationScope = createApplicationScope();
    const cases: Array<{
      owner: RuntimeOwner;
      scope: ModuleScope | FrameScope | WidgetScope;
    }> = [
      {
        owner: { kind: 'module', token: TestModuleOwner },
        scope: new ModuleScope(applicationScope),
      },
      {
        owner: { instanceId: 'frame:test', kind: 'frame', token: TestFrameOwner },
        scope: new FrameScope(applicationScope),
      },
      {
        owner: { instanceId: 'widget:test', kind: 'widget', token: TestWidgetOwner },
        scope: new WidgetScope(applicationScope),
      },
    ];

    for (const testCase of cases) {
      const pipeline = new RuntimeProviderPipeline(testCase.scope, [FailingHookProvider], testCase.owner);

      try {
        await pipeline.runBeforeLoad(createContext(testCase.scope));
        throw new Error('Provider failure was expected.');
      } catch (error) {
        const failure = captureRuntimeFailure(error, {
          operation: 'test',
          owner: TEST_OWNER,
          participant: { kind: 'runtime' },
        });

        expect(failure.source).toEqual({
          operation: 'beforeLoad',
          owner: testCase.owner,
          participant: { kind: 'provider', token: FailingHookProvider },
        });
      }

      await pipeline.dispose();
      testCase.scope.dispose();
    }

    applicationScope.dispose();
  });
});

const createContext = (scope: ModuleScope | FrameScope | WidgetScope): RuntimeProviderContextInterface => ({
  params: {},
  phase: 'beforeRender',
  props: {},
  request: new Request('https://tiyn-app.test/runtime'),
  scope,
  signal: new AbortController().signal,
});

const createApplicationScope = (): ApplicationScope => {
  const applicationScope = new ApplicationScope();

  applicationScope.activate(TestApplicationOwner);

  return applicationScope;
};

abstract class ProviderDependencyInterface {}

@Injectable()
class ProviderDependency extends ProviderDependencyInterface {}

abstract class TestPreloadServiceInterface {
  abstract preload(context: RuntimeProviderContextInterface): void;
}

@Injectable()
class TestPreloadService extends TestPreloadServiceInterface {
  static contexts: RuntimeProviderContextInterface[] = [];

  preload(context: RuntimeProviderContextInterface): void {
    TestPreloadService.contexts.push(context);
  }
}

class TestApplicationBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(TestPreloadServiceInterface).to(TestPreloadService).inSingletonScope();
  }
}

@UseBindings(TestApplicationBindings)
class TestApplicationOwner {}

class TestModuleOwner {}

class TestFrameOwner {}

class TestWidgetOwner {}

@Provider()
class FailingHookProvider extends RuntimeProviderInterface {
  beforeLoad(): never {
    throw new Error('Blocking provider failed.');
  }
}

class ProviderBindings extends BindingModuleInterface {
  static registerCount = 0;

  register(registry: BindingRegistryInterface): void {
    ProviderBindings.registerCount += 1;
    registry.bind(ProviderDependencyInterface).to(ProviderDependency).inSingletonScope();
  }
}

abstract class RecordingProvider extends RuntimeProviderInterface {
  abstract readonly dependency: ProviderDependencyInterface;
  abstract readonly preloadService: TestPreloadServiceInterface;

  protected abstract get contexts(): RuntimeProviderContextInterface[];
  protected abstract get disposeBindingStates(): boolean[];
  protected abstract get providerScope(): ProviderScope | undefined;

  beforeRender(context: RuntimeProviderContextInterface): RuntimeProviderResult {
    this.contexts.push(context);
    this.preloadService.preload(context);

    return () => {
      this.disposeBindingStates.push(this.providerScope?.has(ProviderDependencyInterface) ?? false);
    };
  }
}

@UseBindings(ProviderBindings)
@Provider()
class TestProvider extends RecordingProvider {
  static constructorDependencies: ProviderDependencyInterface[] = [];
  static contexts: RuntimeProviderContextInterface[] = [];
  static disposeBindingStates: boolean[] = [];
  static providerScope: ProviderScope | undefined;

  constructor(
    @Inject(ProviderDependencyInterface)
    readonly dependency: ProviderDependencyInterface,
    @Inject(TestPreloadServiceInterface)
    readonly preloadService: TestPreloadServiceInterface,
  ) {
    super();
    TestProvider.constructorDependencies.push(dependency);
  }

  protected get contexts(): RuntimeProviderContextInterface[] {
    return TestProvider.contexts;
  }

  protected get disposeBindingStates(): boolean[] {
    return TestProvider.disposeBindingStates;
  }

  protected get providerScope(): ProviderScope | undefined {
    return TestProvider.providerScope;
  }
}

@UseBindings(ProviderBindings)
@Provider()
class OtherProvider extends RecordingProvider {
  static constructorDependencies: ProviderDependencyInterface[] = [];
  static contexts: RuntimeProviderContextInterface[] = [];
  static disposeBindingStates: boolean[] = [];
  static providerScope: ProviderScope | undefined;

  constructor(
    @Inject(ProviderDependencyInterface)
    readonly dependency: ProviderDependencyInterface,
    @Inject(TestPreloadServiceInterface)
    readonly preloadService: TestPreloadServiceInterface,
  ) {
    super();
    OtherProvider.constructorDependencies.push(dependency);
  }

  protected get contexts(): RuntimeProviderContextInterface[] {
    return OtherProvider.contexts;
  }

  protected get disposeBindingStates(): boolean[] {
    return OtherProvider.disposeBindingStates;
  }

  protected get providerScope(): ProviderScope | undefined {
    return OtherProvider.providerScope;
  }
}

@UseBindings(ProviderBindings)
@Provider()
class FailingProvider extends RuntimeProviderInterface {
  constructor(@Inject(ProviderDependencyInterface) dependency: ProviderDependencyInterface) {
    super();
    void dependency;

    throw new Error('Provider construction failed.');
  }
}

@Provider()
class TestSetupProvider extends RuntimeProviderInterface {
  static cleanupCount = 0;
  static setupCount = 0;

  setup(): RuntimeProviderResult {
    TestSetupProvider.setupCount += 1;

    return () => {
      TestSetupProvider.cleanupCount += 1;
    };
  }
}

@SingletonProvider()
class TestSingletonProvider implements SingletonProviderInterface {
  static cleanupCount = 0;
  static constructorCount = 0;
  static setupCount = 0;

  constructor() {
    TestSingletonProvider.constructorCount += 1;
  }

  setup(): RuntimeProviderResult {
    TestSingletonProvider.setupCount += 1;

    return () => {
      TestSingletonProvider.cleanupCount += 1;
    };
  }
}

@SingletonProvider()
class FailingSingletonProvider implements SingletonProviderInterface {
  static cleanupCount = 0;
  static setupCount = 0;

  setup(): RuntimeProviderResult {
    FailingSingletonProvider.setupCount += 1;

    if (FailingSingletonProvider.setupCount === 1) {
      throw new Error('Singleton setup failed.');
    }

    return () => {
      FailingSingletonProvider.cleanupCount += 1;
    };
  }
}
