import type { RuntimeContextInterface } from '../../../runtime/context';
import type { PolicyToken } from '../../contract/policy';

import type { PolicyDescriptor } from '../policy-descriptor';
import { PolicyDescriptorBuilder } from '../policy-descriptor-builder';

export type PolicyDeclaration<TContext extends RuntimeContextInterface = RuntimeContextInterface, TOptions = unknown> =
  PolicyToken<TContext, TOptions> | PolicyDescriptor<TContext, TOptions> | PolicyDescriptorBuilder<TContext, TOptions>;

export const isPolicyDescriptor = <TContext extends RuntimeContextInterface>(
  declaration: PolicyDeclaration<TContext>,
): declaration is PolicyDescriptor<TContext> => {
  return typeof declaration === 'object' && declaration !== null && 'use' in declaration;
};

export const isPolicyDescriptorBuilder = <TContext extends RuntimeContextInterface>(
  declaration: PolicyDeclaration<TContext>,
): declaration is PolicyDescriptorBuilder<TContext> => {
  return declaration instanceof PolicyDescriptorBuilder;
};
