import { PolicyInterface } from '../../../policy/contract/policy';
import type { PolicyResult } from '../../../policy/contract/policy-result';

import type { RouteRuntimeContextInterface } from '../route-runtime-context';

export abstract class RoutePolicyInterface<TOptions = unknown> extends PolicyInterface<
  RouteRuntimeContextInterface,
  TOptions
> {
  abstract execute(context: RouteRuntimeContextInterface, options?: TOptions): PolicyResult | Promise<PolicyResult>;
}
