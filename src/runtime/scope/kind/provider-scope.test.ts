import 'reflect-metadata';

import { beforeEach, describe, expect, it } from 'vitest';

import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { UseBindings } from '../../../di/composition/use-bindings';
import { Inject, Injectable } from '../../../di/injection/decorators';
import { Provider, RuntimeProviderInterface } from '../../provider/runtime-provider';

import { ApplicationScope } from './application-scope';
import { ModuleScope } from './module-scope';
import { ProviderScope } from './provider-scope';

describe('ProviderScope', () => {
  beforeEach(() => {
    SharedProviderBindings.registerCount = 0;
  });

  it('shares provider bindings while keeping provider instances isolated', () => {
    const applicationScope = new ApplicationScope();
    const providerScope = applicationScope.get(ProviderScope);
    const first = providerScope.acquire(FirstProvider);
    const second = providerScope.acquire(SecondProvider);

    expect(first.value).not.toBe(second.value);
    expect(first.value.dependency).toBe(second.value.dependency);
    expect(SharedProviderBindings.registerCount).toBe(1);

    first.dispose();

    expect(providerScope.has(SharedProviderDependencyInterface)).toBe(true);

    second.dispose();

    expect(providerScope.has(SharedProviderDependencyInterface)).toBe(false);

    applicationScope.dispose();
  });

  it('does not expose provider bindings to sibling runtime scopes', () => {
    const applicationScope = new ApplicationScope();
    const providerScope = applicationScope.get(ProviderScope);
    const moduleScope = new ModuleScope(applicationScope);
    const instance = providerScope.acquire(FirstProvider);

    expect(providerScope.has(SharedProviderDependencyInterface)).toBe(true);
    expect(moduleScope.has(SharedProviderDependencyInterface)).toBe(false);

    instance.dispose();
    moduleScope.dispose();
    applicationScope.dispose();
  });

  it('rolls back retained bindings when provider resolution fails', () => {
    const applicationScope = new ApplicationScope();
    const providerScope = applicationScope.get(ProviderScope);

    expect(() => providerScope.acquire(FailingProvider)).toThrow('Provider construction failed.');
    expect(providerScope.has(SharedProviderDependencyInterface)).toBe(false);

    applicationScope.dispose();
  });

  it('releases outstanding provider acquisitions when application scope is disposed', () => {
    const applicationScope = new ApplicationScope();
    const providerScope = applicationScope.get(ProviderScope);
    const instance = providerScope.acquire(FirstProvider);

    applicationScope.dispose();

    expect(() => instance.dispose()).not.toThrow();
    expect(() => providerScope.has(SharedProviderDependencyInterface)).toThrow('Runtime scope уже освобожден.');
  });
});

abstract class SharedProviderDependencyInterface {}

@Injectable()
class SharedProviderDependency extends SharedProviderDependencyInterface {}

class SharedProviderBindings extends BindingModuleInterface {
  static registerCount = 0;

  register(registry: BindingRegistryInterface): void {
    SharedProviderBindings.registerCount += 1;
    registry.bind(SharedProviderDependencyInterface).to(SharedProviderDependency).inSingletonScope();
  }
}

@UseBindings(SharedProviderBindings)
@Provider()
class FirstProvider extends RuntimeProviderInterface {
  constructor(
    @Inject(SharedProviderDependencyInterface)
    readonly dependency: SharedProviderDependencyInterface,
  ) {
    super();
  }
}

@UseBindings(SharedProviderBindings)
@Provider()
class SecondProvider extends RuntimeProviderInterface {
  constructor(
    @Inject(SharedProviderDependencyInterface)
    readonly dependency: SharedProviderDependencyInterface,
  ) {
    super();
  }
}

@UseBindings(SharedProviderBindings)
@Provider()
class FailingProvider extends RuntimeProviderInterface {
  constructor(@Inject(SharedProviderDependencyInterface) dependency: SharedProviderDependencyInterface) {
    super();
    void dependency;

    throw new Error('Provider construction failed.');
  }
}
