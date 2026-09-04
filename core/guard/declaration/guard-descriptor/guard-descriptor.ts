import type { GuardFailureStrategy } from '../../contract/guard-failure-strategy';
import type { GuardToken } from '../../contract/guard';

export interface GuardDescriptor<TContext = unknown> {
  readonly failureStrategy?: GuardFailureStrategy;
  readonly use: GuardToken<TContext>;
}
