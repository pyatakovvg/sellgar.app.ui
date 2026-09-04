import type { DependencyToken } from '../../../di/token/dependency-token';
import type { RuntimeContextInterface } from '../../../runtime/context/runtime-context';
import type { PolicyDescriptor } from '../../declaration/policy-descriptor';
import type { PolicyBoundaryDecision } from '../policy-boundary-decision';
import type { PolicyResult } from '../policy-result';

export interface PolicyResultHandlerContextInterface<
  TContext extends RuntimeContextInterface = RuntimeContextInterface,
> {
  readonly policy: PolicyDescriptor<TContext>;
  readonly policyResult: PolicyResult;
  readonly runtimeContext: TContext;
}

export abstract class PolicyResultHandlerInterface<TContext extends RuntimeContextInterface = RuntimeContextInterface> {
  abstract execute(
    context: PolicyResultHandlerContextInterface<TContext>,
  ): PolicyBoundaryDecision | Promise<PolicyBoundaryDecision>;
}

export type PolicyResultHandlerToken<TContext extends RuntimeContextInterface = RuntimeContextInterface> =
  DependencyToken<PolicyResultHandlerInterface<TContext>>;

export type PolicyResultHandlerDeclaration<TContext extends RuntimeContextInterface = RuntimeContextInterface> =
  PolicyBoundaryDecision | PolicyResultHandlerToken<TContext>;
