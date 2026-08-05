import {
  isGuardDescriptor,
  isGuardDescriptorBuilder,
  normalizeGuardDeclarations,
  type GuardDeclaration,
  type GuardDeclarations,
} from '../../declaration/guard-declaration';
import type { GuardDescriptor } from '../../declaration/guard-descriptor';

import type { DependencyConstructor } from '../../../di/binding/binding-builder';
import type { DependencyToken } from '../../../di/token/dependency-token';
import type { RuntimeScopeInterface } from '../../../runtime/scope/contract';
import { isGuardToken, type GuardInterface } from '../../contract/guard';

interface AutoBindableRuntimeScope {
  bindSelf<TValue>(token: DependencyConstructor<TValue>): void;

  has<TValue>(token: DependencyToken<TValue>): boolean;
}

export type GuardRunnerResult<TContext = unknown> =
  | { readonly type: 'pass' }
  | {
      readonly guard: GuardDescriptor<TContext>;
      readonly type: 'fail';
    };

export class GuardRunner {
  constructor(private readonly scope: RuntimeScopeInterface) {}

  async execute<TContext>(
    declarations: GuardDeclarations<TContext>,
    context: TContext,
  ): Promise<GuardRunnerResult<TContext>> {
    const guards = normalizeGuardDeclarations(declarations);

    for (const declaration of guards) {
      const descriptor = this.normalize(declaration);
      const guard = this.resolveGuard(descriptor);
      const result = await guard.execute(context);

      if (!result) {
        return {
          guard: descriptor,
          type: 'fail',
        };
      }
    }

    return {
      type: 'pass',
    };
  }

  private normalize<TContext>(declaration: GuardDeclaration<TContext>): GuardDescriptor<TContext> {
    if (isGuardDescriptorBuilder(declaration)) {
      return declaration.toDescriptor();
    }

    if (isGuardDescriptor(declaration)) {
      return declaration;
    }

    return {
      use: declaration,
    };
  }

  private resolveGuard<TContext>(descriptor: GuardDescriptor<TContext>): GuardInterface<TContext> {
    if (isAutoBindableRuntimeScope(this.scope) && !this.scope.has(descriptor.use)) {
      this.assertGuardToken(descriptor.use);
      this.scope.bindSelf(descriptor.use as DependencyConstructor<GuardInterface<TContext>>);
    }

    return this.scope.get(descriptor.use) as GuardInterface<TContext>;
  }

  private assertGuardToken<TContext>(token: DependencyToken<GuardInterface<TContext>>): void {
    if (!isGuardToken(token)) {
      throw new Error('Guard class must be decorated with @Guard().');
    }
  }
}

const isAutoBindableRuntimeScope = (
  scope: RuntimeScopeInterface,
): scope is RuntimeScopeInterface & AutoBindableRuntimeScope => {
  return (
    'bindSelf' in scope && 'has' in scope && typeof scope.bindSelf === 'function' && typeof scope.has === 'function'
  );
};
