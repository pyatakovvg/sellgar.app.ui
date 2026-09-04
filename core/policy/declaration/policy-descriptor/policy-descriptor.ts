import type { RuntimeContextInterface } from '../../../runtime/context/runtime-context';
import type { PolicyResultHandlerDeclaration } from '../../contract/policy-result-handler';
import type { PolicyToken } from '../../contract/policy';

export interface PolicyDescriptor<
  TContext extends RuntimeContextInterface = RuntimeContextInterface,
  TOptions = unknown,
> {
  readonly onError?: PolicyResultHandlerDeclaration<TContext>;
  readonly onFail?: PolicyResultHandlerDeclaration<TContext>;
  readonly onPass?: PolicyResultHandlerDeclaration<TContext>;
  readonly options?: TOptions;
  readonly use: PolicyToken<TContext, TOptions>;
}
