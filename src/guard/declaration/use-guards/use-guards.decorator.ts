import { normalizeGuardDeclarations } from '../guard-declaration';

import type { GuardDeclaration, GuardDeclarations } from '../guard-declaration';

const USE_GUARDS_METADATA_KEY = Symbol.for('@sellgar/app/use-guards');

export const UseGuards = <TContext = unknown>(
  ...declarations: readonly GuardDeclarations<TContext>[]
): MethodDecorator => {
  return (target, propertyKey) => {
    const guards = declarations.flatMap((declaration) => {
      return [...normalizeGuardDeclarations(declaration)];
    });
    const existing = Reflect.getOwnMetadata(USE_GUARDS_METADATA_KEY, target, propertyKey) as
      readonly GuardDeclaration<TContext>[] | undefined;

    Reflect.defineMetadata(USE_GUARDS_METADATA_KEY, [...(existing ?? []), ...guards], target, propertyKey);
  };
};

export const getUseGuardsMetadata = <TContext = unknown>(
  target: object,
  propertyKey: string | symbol,
): readonly GuardDeclaration<TContext>[] => {
  return (
    (Reflect.getOwnMetadata(USE_GUARDS_METADATA_KEY, target, propertyKey) as
      readonly GuardDeclaration<TContext>[] | undefined) ?? []
  );
};
