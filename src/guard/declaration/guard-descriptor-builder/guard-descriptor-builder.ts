import type { GuardFailureStrategy } from '../../contract/guard-failure-strategy';

import type { GuardDescriptor } from '../guard-descriptor';

export class GuardDescriptorBuilder<TContext = unknown> {
  constructor(private readonly descriptor: GuardDescriptor<TContext>) {}

  failureStrategy(strategy: GuardFailureStrategy): GuardDescriptorBuilder<TContext> {
    return new GuardDescriptorBuilder({
      ...this.descriptor,
      failureStrategy: strategy,
    });
  }

  toDescriptor(): GuardDescriptor<TContext> {
    return {
      ...this.descriptor,
    };
  }
}
