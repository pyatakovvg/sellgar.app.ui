import { type Bind, type BindInWhenOnFluentSyntax, type BindToFluentSyntax } from 'inversify';
import type { ServiceIdentifier } from 'inversify';

import {
  BindingBuilderInterface,
  BindingScopeBuilderInterface,
  type DependencyConstructor,
} from '../../binding/binding-builder';
import { BindingRegistryInterface } from '../../binding/binding-registry';
import type { DependencyToken } from '../../token/dependency-token';

export interface BindingRegistryObserver {
  readonly bindConstructor?: <TValue>(
    token: DependencyToken<TValue>,
    constructor: DependencyConstructor<TValue>,
  ) => void;
}

class InversifyBindingScopeBuilder<TValue> extends BindingScopeBuilderInterface {
  constructor(private readonly syntax: BindInWhenOnFluentSyntax<TValue>) {
    super();
  }

  inSingletonScope(): void {
    this.syntax.inSingletonScope();
  }

  inTransientScope(): void {
    this.syntax.inTransientScope();
  }

  inRequestScope(): void {
    this.syntax.inRequestScope();
  }
}

class InversifyBindingBuilder<TValue> extends BindingBuilderInterface<TValue> {
  constructor(
    private readonly token: DependencyToken<TValue>,
    private readonly syntax: BindToFluentSyntax<TValue>,
    private readonly observer?: BindingRegistryObserver,
  ) {
    super();
  }

  to(constructor: DependencyConstructor<TValue>): BindingScopeBuilderInterface {
    this.observer?.bindConstructor?.(this.token, constructor);

    return new InversifyBindingScopeBuilder(this.syntax.to(constructor));
  }

  toSelf(): BindingScopeBuilderInterface {
    if (typeof this.token === 'function') {
      this.observer?.bindConstructor?.(this.token, this.token as DependencyConstructor<TValue>);
    }

    return new InversifyBindingScopeBuilder(this.syntax.toSelf());
  }

  toConstantValue(value: TValue): void {
    this.syntax.toConstantValue(value);
  }

  toService(token: DependencyToken<TValue>): void {
    this.syntax.toService(token);
  }
}

export class InversifyBindingRegistry extends BindingRegistryInterface {
  constructor(
    private readonly bindToken: Bind,
    private readonly observer?: BindingRegistryObserver,
  ) {
    super();
  }

  bind<TValue>(token: DependencyToken<TValue>): BindingBuilderInterface<TValue> {
    return new InversifyBindingBuilder(token, this.bindToken(token as ServiceIdentifier<TValue>), this.observer);
  }
}
