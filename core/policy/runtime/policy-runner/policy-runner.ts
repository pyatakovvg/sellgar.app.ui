import type { DependencyConstructor } from '../../../di/binding/binding-builder';
import type { DependencyToken } from '../../../di/token/dependency-token';
import type { RuntimeContextInterface } from '../../../runtime/context/runtime-context';
import type { RuntimeOwner } from '../../../runtime/failure/runtime-failure';
import { executeRuntimeParticipant } from '../../../runtime/operation/runtime-operation';
import type { RuntimeScope } from '../../../runtime/scope/base/runtime-scope';
import { isPolicyBoundaryDecision, type PolicyBoundaryDecision } from '../../contract/policy-boundary-decision';
import { isPolicyToken, type PolicyInterface } from '../../contract/policy';
import type { PolicyResult } from '../../contract/policy-result';
import type {
  PolicyResultHandlerDeclaration,
  PolicyResultHandlerInterface,
} from '../../contract/policy-result-handler';
import {
  isPolicyDescriptor,
  isPolicyDescriptorBuilder,
  type PolicyDeclaration,
} from '../../declaration/policy-declaration';
import type { PolicyDescriptor } from '../../declaration/policy-descriptor';

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

    return { use: declaration };
  }

  private resolvePolicy(descriptor: PolicyDescriptor<TContext>): PolicyInterface<TContext> {
    if (!this.scope.has(descriptor.use)) {
      if (!isPolicyToken(descriptor.use)) {
        throw new Error('Policy class должна быть отмечена декоратором @Policy().');
      }

      this.scope.bindSelf(descriptor.use as DependencyConstructor<PolicyInterface<TContext>>);
    }

    return this.scope.get(descriptor.use) as PolicyInterface<TContext>;
  }

  private async executePolicy(
    descriptor: PolicyDescriptor<TContext>,
    policy: PolicyInterface<TContext>,
    runtimeContext: TContext,
  ): Promise<PolicyResult> {
    const policyResult = await executeRuntimeParticipant(this.createSource('execute', descriptor.use), () => {
      if (descriptor.options === undefined) {
        return policy.execute(runtimeContext);
      }

      return policy.execute(runtimeContext, descriptor.options);
    });

    if (policyResult.type !== 'pass' && policyResult.type !== 'fail') {
      throw new Error('Policy должна вернуть результат с type pass или fail.');
    }

    return policyResult;
  }

  private async handleResult(
    descriptor: PolicyDescriptor<TContext>,
    policyResult: PolicyResult,
    runtimeContext: TContext,
  ): Promise<PolicyBoundaryDecision> {
    if (policyResult.type === 'pass') {
      return await this.executeHandler(
        descriptor.onPass,
        descriptor,
        policyResult,
        runtimeContext,
        { type: 'continue' },
        'handle-pass',
      );
    }

    return await this.executeHandler(
      descriptor.onFail,
      descriptor,
      policyResult,
      runtimeContext,
      { type: 'forbidden' },
      'handle-fail',
    );
  }

  private async handleError(
    descriptor: PolicyDescriptor<TContext>,
    error: unknown,
    runtimeContext: TContext,
  ): Promise<PolicyBoundaryDecision> {
    const decision = await this.executeHandler(
      descriptor.onError,
      descriptor,
      { data: error, reason: 'policy-error', type: 'fail' },
      runtimeContext,
      { error, type: 'error' },
      'handle-error',
    );

    if (decision.type === 'error') {
      return await executeRuntimeParticipant(this.createSource('execute', descriptor.use), () => {
        throw decision.error;
      });
    }

    return decision;
  }

  private async executeHandler(
    handler: PolicyResultHandlerDeclaration<TContext> | undefined,
    policy: PolicyDescriptor<TContext>,
    policyResult: PolicyResult,
    runtimeContext: TContext,
    fallback: PolicyBoundaryDecision,
    operation: string,
  ): Promise<PolicyBoundaryDecision> {
    if (handler === undefined) {
      return fallback;
    }

    if (isPolicyBoundaryDecision(handler)) {
      return handler;
    }

    const decision = await executeRuntimeParticipant(this.createSource(operation, policy.use), () => {
      const resolvedHandler = this.scope.get(handler) as PolicyResultHandlerInterface<TContext>;

      return resolvedHandler.execute({ policy, policyResult, runtimeContext });
    });

    if (!isPolicyBoundaryDecision(decision)) {
      throw new Error('Policy result handler должен вернуть PolicyBoundaryDecision.');
    }

    return decision;
  }

  private createSource(operation: string, token: DependencyToken<unknown>) {
    return {
      operation,
      owner: this.owner,
      participant: { kind: 'policy' as const, token },
    };
  }
}
