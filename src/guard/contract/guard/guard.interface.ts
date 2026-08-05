import { GuardDescriptorBuilder } from '../../declaration/guard-descriptor-builder';

import type { DependencyToken } from '../../../di/token/dependency-token';
import type { GuardResult } from '../guard-result';

export type GuardToken<TContext = unknown> = DependencyToken<GuardInterface<TContext>>;

export abstract class GuardInterface<TContext = unknown> {
  static configure<TContext>(this: GuardToken<TContext>): GuardDescriptorBuilder<TContext> {
    return new GuardDescriptorBuilder({
      use: this,
    });
  }

  abstract execute(context: TContext): GuardResult | Promise<GuardResult>;
}
