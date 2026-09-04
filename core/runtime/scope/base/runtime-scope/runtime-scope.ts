import { Container, ContainerModule } from 'inversify';
import type { ServiceIdentifier } from 'inversify';

import { isControllerToken } from '../../../../controller/contract/controller';
import type { BindingModuleConstructor } from '../../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../../di/binding/binding-registry';
import { getUseBindingsMetadata } from '../../../../di/composition/use-bindings';
import { InversifyBindingRegistry } from '../../../../di/inversify/inversify-binding-registry';
import type { DependencyConstructor } from '../../../../di/binding/binding-builder';
import type { DependencyToken } from '../../../../di/token/dependency-token';

interface RetainedBindingModule {
  readonly containerModule: ContainerModule;
  readonly count: number;
}

export interface RuntimeScopeActivateOptions {
  readonly collectControllerBindings?: boolean;
}

export interface RuntimeScopeBindingsLease {
  dispose(): void;
}

export abstract class RuntimeScope {
  private readonly controllerTokens = new Set<DependencyToken<unknown>>();
  private readonly disposeListeners = new Set<() => void>();
  private readonly retainedModules = new Map<BindingModuleConstructor, RetainedBindingModule>();
  private readonly retainedOrder: BindingModuleConstructor[] = [];
  private isDisposed = false;

  protected readonly container: Container;

  constructor(parent?: RuntimeScope) {
    this.container = new Container({
      parent: parent?.container,
    });
  }

  activate(owner: unknown, options: RuntimeScopeActivateOptions = {}): void {
    this.retainedOrder.push(...this.retainBindingModules(owner, options));
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    const disposeErrors: unknown[] = [];

    for (const listener of this.disposeListeners) {
      try {
        listener();
      } catch (error) {
        disposeErrors.push(error);
      }
    }

    this.disposeListeners.clear();
    this.isDisposed = true;

    for (const bindingModule of [...this.retainedOrder].reverse()) {
      this.release(bindingModule);
    }

    if (disposeErrors.length === 1) {
      throw disposeErrors[0];
    }

    if (disposeErrors.length > 1) {
      throw new AggregateError(disposeErrors, 'Ошибки освобождения runtime scope.');
    }
  }

  onDispose(listener: () => void): () => void {
    this.assertActive();
    this.disposeListeners.add(listener);

    return () => {
      this.disposeListeners.delete(listener);
    };
  }

  get<TValue>(token: DependencyToken<TValue>): TValue {
    this.assertActive();

    return this.container.get(token as ServiceIdentifier<TValue>);
  }

  has<TValue>(token: DependencyToken<TValue>): boolean {
    this.assertActive();

    return this.container.isBound(token as ServiceIdentifier<TValue>);
  }

  hasOwn<TValue>(token: DependencyToken<TValue>): boolean {
    this.assertActive();

    return this.container.isCurrentBound(token as ServiceIdentifier<TValue>);
  }

  bindSelf<TValue>(token: DependencyConstructor<TValue>): void {
    this.register((registry) => {
      registry.bind(token).toSelf();
    });
  }

  bindSelfSingleton<TValue>(token: DependencyConstructor<TValue>): void {
    this.register((registry) => {
      registry.bind(token).toSelf().inSingletonScope();
    });
  }

  getControllerTokens(): readonly DependencyToken<unknown>[] {
    this.assertActive();

    return [...this.controllerTokens];
  }

  protected register(registerBindings: (registry: BindingRegistryInterface) => void): void {
    this.assertActive();

    const containerModule = new ContainerModule(({ bind }) => {
      registerBindings(
        new InversifyBindingRegistry(bind, {
          bindConstructor: (token, constructor) => {
            this.registerControllerToken(token, constructor, {});
          },
        }),
      );
    });

    this.container.load(containerModule);
  }

  protected retainBindings(owner: unknown, options: RuntimeScopeActivateOptions = {}): RuntimeScopeBindingsLease {
    const bindingModules = this.retainBindingModules(owner, options);
    let active = true;

    return {
      dispose: () => {
        if (!active) {
          return;
        }

        active = false;

        for (const bindingModule of [...bindingModules].reverse()) {
          this.release(bindingModule);
        }
      },
    };
  }

  private retainBindingModules(
    owner: unknown,
    options: RuntimeScopeActivateOptions,
  ): readonly BindingModuleConstructor[] {
    this.assertActive();

    const bindingModules = getUseBindingsMetadata(owner);
    const retainedModules: BindingModuleConstructor[] = [];

    try {
      for (const bindingModule of bindingModules) {
        this.retain(bindingModule, options);
        retainedModules.push(bindingModule);
      }
    } catch (error) {
      for (const bindingModule of retainedModules.reverse()) {
        this.release(bindingModule);
      }

      throw error;
    }

    return bindingModules;
  }

  private retain(bindingModule: BindingModuleConstructor, options: RuntimeScopeActivateOptions): void {
    const retainedModule = this.retainedModules.get(bindingModule);

    if (retainedModule) {
      this.retainedModules.set(bindingModule, {
        containerModule: retainedModule.containerModule,
        count: retainedModule.count + 1,
      });
      return;
    }

    const containerModule = new ContainerModule(({ bind }) => {
      const registry = new InversifyBindingRegistry(bind, {
        bindConstructor: (token, constructor) => {
          this.registerControllerToken(token, constructor, options);
        },
      });
      const instance = new bindingModule();

      instance.register(registry);
    });

    this.container.load(containerModule);
    this.retainedModules.set(bindingModule, {
      containerModule,
      count: 1,
    });
  }

  private release(bindingModule: BindingModuleConstructor): void {
    const retainedModule = this.retainedModules.get(bindingModule);

    if (!retainedModule) {
      return;
    }

    if (retainedModule.count > 1) {
      this.retainedModules.set(bindingModule, {
        containerModule: retainedModule.containerModule,
        count: retainedModule.count - 1,
      });
      return;
    }

    this.retainedModules.delete(bindingModule);
    this.container.unload(retainedModule.containerModule);
  }

  private assertActive(): void {
    if (this.isDisposed) {
      throw new Error('Runtime scope уже освобожден.');
    }
  }

  private registerControllerToken<TValue>(
    token: DependencyToken<TValue>,
    constructor: DependencyConstructor<TValue>,
    options: RuntimeScopeActivateOptions,
  ): void {
    if (!isControllerToken(constructor)) {
      return;
    }

    if (options.collectControllerBindings !== true) {
      throw new Error('Controller binding можно регистрировать только в scope runtime entity.');
    }

    if (this.controllerTokens.has(token)) {
      throw new Error('Controller token уже зарегистрирован в scope runtime entity.');
    }

    this.controllerTokens.add(token);
  }
}
