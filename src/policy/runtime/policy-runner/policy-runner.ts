import type { RuntimeContextInterface } from '../../../runtime/context';
import type { RuntimeScope } from '../../../runtime/scope/base';
import type { DependencyConstructor } from '../../../di/binding/binding-builder';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { throwRuntimeFailure, type RuntimeOwner } from '../../../runtime/failure';

import {
  isPolicyDescriptor,
  isPolicyDescriptorBuilder,
  type PolicyDeclaration,
} from '../../declaration/policy-declaration';
import type { PolicyDescriptor } from '../../declaration/policy-descriptor';
import type { PolicyBoundaryDecision } from '../../contract/policy-boundary-decision';
import { isPolicyToken, type PolicyInterface } from '../../contract/policy';
import type { PolicyResult } from '../../contract/policy-result';
import type {
  PolicyResultHandlerDeclaration,
  PolicyResultHandlerInterface,
} from '../../contract/policy-result-handler';

interface AutoBindableRuntimeScope {
  bindSelf<TValue>(token: DependencyConstructor<TValue>): void;

  has<TValue>(token: DependencyToken<TValue>): boolean;
}

export class PolicyRunner<TContext extends RuntimeContextInterface = RuntimeContextInterface> {
  constructor(
    private readonly scope: RuntimeScope,
    private readonly owner: RuntimeOwner,
  ) {}

  async execute(
    declarations: readonly PolicyDeclaration<TContext>[],
    runtimeContext: TContext,
  ): Promise<PolicyBoundaryDecision> {
    for (const declaration of declarations) {
      const descriptor = this.normalize(declaration);
      const policy = this.resolvePolicy(descriptor);

      try {
        const policyResult = await this.executePolicy(descriptor, policy, runtimeContext);
        const decision = await this.handleResult(descriptor, policyResult, runtimeContext);

        if (decision.type !== 'continue') {
          return decision;
        }
      } catch (error) {
        return await this.handleError(descriptor, error, runtimeContext);
      }
    }

    return { type: 'continue' };
  }

  async test(declarations: readonly PolicyDeclaration<TContext>[], runtimeContext: TContext): Promise<boolean> {
    for (const declaration of declarations) {
      const descriptor = this.normalize(declaration);
      const policy = this.resolvePolicy(descriptor);
      const policyResult = await this.executePolicy(descriptor, policy, runtimeContext);

      if (policyResult.type === 'fail') {
        return false;
      }
    }

    return true;
  }

  private normalize(declaration: PolicyDeclaration<TContext>): PolicyDescriptor<TContext> {
    if (isPolicyDescriptorBuilder(declaration)) {
      return declaration.toDescriptor();
    }

    if (isPolicyDescriptor(declaration)) {
      return declaration;
    }

    return {
      use: declaration,
    };
  }

  private resolvePolicy(descriptor: PolicyDescriptor<TContext>): PolicyInterface<TContext> {
    if (isAutoBindableRuntimeScope(this.scope) && !this.scope.has(descriptor.use)) {
      this.assertPolicyToken(descriptor.use);
      this.scope.bindSelf(descriptor.use as DependencyConstructor<PolicyInterface<TContext>>);
    }

    return this.scope.get(descriptor.use) as PolicyInterface<TContext>;
  }

  private assertPolicyToken(token: DependencyToken<PolicyInterface<TContext>>): void {
    if (!isPolicyToken(token)) {
      throw new Error('Policy class must be decorated with @Policy().');
    }
  }

  private async executePolicy(
    descriptor: PolicyDescriptor<TContext>,
    policy: PolicyInterface<TContext>,
    runtimeContext: TContext,
  ): Promise<PolicyResult> {
    if (descriptor.options === undefined) {
      return policy.execute(runtimeContext);
    }

    return policy.execute(runtimeContext, descriptor.options);
  }

  private async handleResult(
    descriptor: PolicyDescriptor<TContext>,
    policyResult: PolicyResult,
    runtimeContext: TContext,
  ): Promise<PolicyBoundaryDecision> {
    if (policyResult.type === 'pass') {
      return await this.executeHandler(descriptor.onPass, descriptor, policyResult, runtimeContext, {
        type: 'continue',
      });
    }

    return await this.executeHandler(descriptor.onFail, descriptor, policyResult, runtimeContext, {
      type: 'forbidden',
    });
  }

  private async handleError(
    descriptor: PolicyDescriptor<TContext>,
    error: unknown,
    runtimeContext: TContext,
  ): Promise<PolicyBoundaryDecision> {
    try {
      const decision = await this.executeHandler(
        descriptor.onError,
        descriptor,
        { type: 'fail', data: error, reason: 'policy-error' },
        runtimeContext,
        { type: 'error', error },
      );

      if (decision.type === 'error') {
        throwRuntimeFailure(decision.error, {
          operation: 'execute',
          owner: this.owner,
          participant: {
            kind: 'policy',
            token: descriptor.use,
          },
        });
      }

      return decision;
    } catch (handlerError) {
      return throwRuntimeFailure(handlerError, {
        operation: 'handle-error',
        owner: this.owner,
        participant: {
          kind: 'policy',
          token: descriptor.use,
        },
      });
    }
  }

  private async executeHandler(
    handler: PolicyResultHandlerDeclaration<TContext> | undefined,
    policy: PolicyDescriptor<TContext>,
    policyResult: PolicyResult,
    runtimeContext: TContext,
    fallback: PolicyBoundaryDecision,
  ): Promise<PolicyBoundaryDecision> {
    if (!handler) {
      return fallback;
    }

    if (typeof handler === 'object' && handler !== null && 'type' in handler) {
      return handler;
    }

    const resolvedHandler = this.scope.get(handler) as PolicyResultHandlerInterface<TContext>;

    return resolvedHandler.execute({
      policy,
      policyResult,
      runtimeContext,
    });
  }
}

const isAutoBindableRuntimeScope = (scope: RuntimeScope): scope is RuntimeScope & AutoBindableRuntimeScope => {
  return (
    'bindSelf' in scope && 'has' in scope && typeof scope.bindSelf === 'function' && typeof scope.has === 'function'
  );
};
