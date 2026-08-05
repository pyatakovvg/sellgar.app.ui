import type { RuntimeContextInterface } from '../../../runtime/context';
import type { PolicyResultHandlerDeclaration } from '../../contract/policy-result-handler';
import type { PolicyToken } from '../../contract/policy';

import type { PolicyDescriptor } from '../policy-descriptor';

export class PolicyDescriptorBuilder<
  TContext extends RuntimeContextInterface = RuntimeContextInterface,
  TOptions = unknown,
> {
  constructor(private readonly descriptor: PolicyDescriptor<TContext, TOptions>) {}

  onError(handler: PolicyResultHandlerDeclaration<TContext>): PolicyDescriptorBuilder<TContext, TOptions> {
    return new PolicyDescriptorBuilder({
      ...this.descriptor,
      onError: handler,
    });
  }

  onFail(handler: PolicyResultHandlerDeclaration<TContext>): PolicyDescriptorBuilder<TContext, TOptions> {
    return new PolicyDescriptorBuilder({
      ...this.descriptor,
      onFail: handler,
    });
  }

  onPass(handler: PolicyResultHandlerDeclaration<TContext>): PolicyDescriptorBuilder<TContext, TOptions> {
    return new PolicyDescriptorBuilder({
      ...this.descriptor,
      onPass: handler,
    });
  }

  withOptions(options: TOptions): PolicyDescriptorBuilder<TContext, TOptions> {
    return new PolicyDescriptorBuilder({
      ...this.descriptor,
      options,
    });
  }

  toDescriptor(): PolicyDescriptor<TContext, TOptions> {
    return {
      ...this.descriptor,
    };
  }
}

export const createPolicyDescriptor = <TContext extends RuntimeContextInterface, TOptions = unknown>(
  use: PolicyToken<TContext, TOptions>,
): PolicyDescriptor<TContext, TOptions> => {
  return {
    use,
  };
};
