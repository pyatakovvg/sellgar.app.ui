import type { DependencyConstructor } from '../../../di/binding/binding-builder';
import type { DependencyToken } from '../../../di/token/dependency-token';
import type { RuntimeScope } from '../../../runtime/scope/base/runtime-scope';
import { isGuardToken, type GuardInterface } from '../../contract/guard';
import {
  isGuardDescriptor,
  isGuardDescriptorBuilder,
  normalizeGuardDeclarations,
  type GuardDeclaration,
  type GuardDeclarations,
} from '../../declaration/guard-declaration';
import type { GuardDescriptor } from '../../declaration/guard-descriptor';

export type GuardRunnerResult<TContext = unknown> =
  | { readonly type: 'pass' }
  | {
      readonly guard: GuardDescriptor<TContext>;
      readonly type: 'fail';
    };

export class GuardRunner {
  constructor(private readonly scope: RuntimeScope) {}

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
    if (!this.scope.has(descriptor.use)) {
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
