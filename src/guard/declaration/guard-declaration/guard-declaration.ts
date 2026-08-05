import { GuardDescriptorBuilder } from '../guard-descriptor-builder';

import type { GuardToken } from '../../contract/guard';
import type { GuardDescriptor } from '../guard-descriptor';

export type GuardDeclaration<TContext = unknown> =
  GuardToken<TContext> | GuardDescriptor<TContext> | GuardDescriptorBuilder<TContext>;

export type GuardDeclarations<TContext = unknown> = GuardDeclaration<TContext> | readonly GuardDeclaration<TContext>[];

export const isGuardDescriptor = <TContext>(
  declaration: GuardDeclaration<TContext>,
): declaration is GuardDescriptor<TContext> => {
  return typeof declaration === 'object' && declaration !== null && 'use' in declaration;
};

export const isGuardDescriptorBuilder = <TContext>(
  declaration: GuardDeclaration<TContext>,
): declaration is GuardDescriptorBuilder<TContext> => {
  return declaration instanceof GuardDescriptorBuilder;
};

export const normalizeGuardDeclarations = <TContext>(
  declarations: GuardDeclarations<TContext>,
): readonly GuardDeclaration<TContext>[] => {
  if (isGuardDeclarationArray(declarations)) {
    return declarations;
  }

  return [declarations];
};

const isGuardDeclarationArray = <TContext>(
  declarations: GuardDeclarations<TContext>,
): declarations is readonly GuardDeclaration<TContext>[] => {
  return Array.isArray(declarations);
};
