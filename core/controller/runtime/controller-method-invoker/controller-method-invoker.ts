import type { DependencyToken } from '../../../di/token/dependency-token';
import type { RuntimeOwner } from '../../../runtime/failure/runtime-failure';
import { executeRuntimeParticipant } from '../../../runtime/operation/runtime-operation';

export interface ControllerMethodInvocation {
  readonly args: readonly unknown[];
  readonly controller: object;
  readonly method: string | symbol;
  readonly owner: RuntimeOwner;
  readonly token: DependencyToken<unknown>;
}

export const invokeControllerMethod = <TValue>({
  args,
  controller,
  method,
  owner,
  token,
}: ControllerMethodInvocation): TValue => {
  return executeRuntimeParticipant(
    {
      operation: `controller.${String(method)}`,
      owner,
      participant: { kind: 'controller', token },
    },
    () => {
      assertInvocableControllerMethod(method);

      const member = (controller as Record<string | symbol, unknown>)[method];

      if (typeof member !== 'function') {
        throw new Error(`Метод контроллера ${String(method)} недоступен.`);
      }

      return member.apply(controller, args) as TValue;
    },
  ) as TValue;
};

const assertInvocableControllerMethod = (method: string | symbol): void => {
  if (typeof method === 'string' && CONTROLLER_LIFECYCLE_METHODS.has(method)) {
    throw new Error(`Метод контроллера ${method} доступен только через framework lifecycle.`);
  }
};

const CONTROLLER_LIFECYCLE_METHODS: ReadonlySet<string> = new Set(['action', 'dispose', 'loader']);
