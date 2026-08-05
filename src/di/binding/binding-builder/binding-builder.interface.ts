import type { DependencyToken } from '../../token/dependency-token';

export type DependencyConstructor<TValue> = new (...args: any[]) => TValue;

export abstract class BindingScopeBuilderInterface {
  abstract inSingletonScope(): void;
  abstract inTransientScope(): void;
  abstract inRequestScope(): void;
}

export abstract class BindingBuilderInterface<TValue> {
  abstract to(constructor: DependencyConstructor<TValue>): BindingScopeBuilderInterface;
  abstract toSelf(): BindingScopeBuilderInterface;
  abstract toConstantValue(value: TValue): void;
  abstract toService(token: DependencyToken<TValue>): void;
}
