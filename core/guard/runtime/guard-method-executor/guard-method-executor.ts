import type { DependencyToken } from '../../../di/token/dependency-token';
import type { RuntimeScope } from '../../../runtime/scope/base/runtime-scope';
import { GuardFailure } from '../../contract/guard-failure-strategy';
import { GuardRejectedException } from '../../contract/guard-rejected-exception';
import type { GuardDeclaration } from '../../declaration/guard-declaration';
import type { GuardDescriptor } from '../../declaration/guard-descriptor';
import { getUseGuardsMetadata } from '../../declaration/use-guards';
import { GuardRunner } from '../guard-runner';

export interface GuardedMethodOptions<TContext, TValue> {
  readonly context: TContext;
  readonly execute: () => TValue | Promise<TValue>;
  readonly method: string | symbol;
  readonly scope: RuntimeScope;
  readonly target: object;
  readonly token: DependencyToken<unknown>;
}

export const executeGuardedMethod = <TContext, TValue>({
  context,
  execute,
  method,
  scope,
  target,
  token,
}: GuardedMethodOptions<TContext, TValue>): TValue | Promise<TValue> => {
  const declarations = getGuardMethodDeclarations<TContext>(token, target, method);

  if (declarations.length === 0) {
    return execute();
  }

  return executeGuardedDeclarations(declarations, context, execute, method, scope);
};

const executeGuardedDeclarations = async <TContext, TValue>(
  declarations: readonly GuardDeclaration<TContext>[],
  context: TContext,
  execute: () => TValue | Promise<TValue>,
  method: string | symbol,
  scope: RuntimeScope,
): Promise<TValue> => {
  const result = await new GuardRunner(scope).execute(declarations, context);

  if (result.type === 'pass') {
    return await execute();
  }

  return applyGuardFailureStrategy(result.guard, method) as TValue;
};

const getGuardMethodDeclarations = <TContext>(
  token: DependencyToken<unknown>,
  target: object,
  method: string | symbol,
): readonly GuardDeclaration<TContext>[] => {
  const declarations: GuardDeclaration<TContext>[] = [];
  const tokenPrototype = getTokenPrototype(token);

  if (tokenPrototype) {
    declarations.push(...getUseGuardsMetadata<TContext>(tokenPrototype, method));
  }

  declarations.push(...getUseGuardsMetadata<TContext>(Object.getPrototypeOf(target), method));

  return declarations;
};

const getTokenPrototype = (token: DependencyToken<unknown>): object | null => {
  if (typeof token !== 'function') {
    return null;
  }

  return token.prototype as object;
};

const applyGuardFailureStrategy = (descriptor: GuardDescriptor, method: string | symbol): unknown => {
  const strategy = descriptor.failureStrategy ?? GuardFailure.throw();

  switch (strategy.type) {
    case 'return-value':
      return strategy.value;
    case 'throw':
      throw new GuardRejectedException({
        guard: descriptor.use,
        method,
      });
  }
};
