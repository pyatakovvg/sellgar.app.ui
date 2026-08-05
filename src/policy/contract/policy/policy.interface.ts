import { PolicyDescriptorBuilder } from '../../declaration/policy-descriptor-builder';

import type { PolicyResult } from '../policy-result';
import type { AbstractDependencyConstructor, DependencyToken } from '../../../di/token/dependency-token';
import type { RuntimeContextInterface } from '../../../runtime/context';

export type PolicyToken<
  TContext extends RuntimeContextInterface = RuntimeContextInterface,
  TOptions = unknown,
> = DependencyToken<PolicyInterface<TContext, TOptions>>;

export abstract class PolicyInterface<
  TContext extends RuntimeContextInterface = RuntimeContextInterface,
  TOptions = unknown,
> {
  static configure<TContext extends RuntimeContextInterface, TOptions>(
    this: AbstractDependencyConstructor<PolicyInterface<TContext, TOptions>>,
  ): PolicyDescriptorBuilder<TContext, TOptions> {
    return new PolicyDescriptorBuilder({
      use: this,
    });
  }

  abstract execute(context: TContext, options?: TOptions): PolicyResult | Promise<PolicyResult>;
}
