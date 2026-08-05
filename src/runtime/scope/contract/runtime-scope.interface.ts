import type { DependencyToken } from '../../../di/token/dependency-token';

export abstract class RuntimeScopeInterface {
  abstract activate(owner: unknown): void;

  abstract dispose(): void;

  abstract get<TValue>(token: DependencyToken<TValue>): TValue;
}
