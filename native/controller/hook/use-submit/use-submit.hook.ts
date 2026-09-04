import React from 'react';

import type { ControllerActionPayload, ControllerActionResult } from '../../../../core/controller/contract/controller';
import type { DependencyToken } from '../../../../core/di/token/dependency-token';
import { useControllerRuntime } from '../../runtime/controller-runtime-context';

type ControllerSubmitHandler<TPayload, TResult> = [TPayload] extends [never]
  ? () => Promise<TResult | undefined>
  : (payload: TPayload) => Promise<TResult | undefined>;

export type ControllerSubmit<TPayload, TResult> = ControllerSubmitHandler<TPayload, TResult> & {
  readonly data: TResult | undefined;
  readonly error: unknown;
  readonly inProcess: boolean;
};

export const useSubmit = <TController>(
  controllerToken: DependencyToken<TController>,
): ControllerSubmit<ControllerActionPayload<TController>, ControllerActionResult<TController>> => {
  const runtime = useControllerRuntime();
  const state = React.useSyncExternalStore(
    React.useCallback((listener) => runtime.subscribe(listener), [runtime]),
    React.useCallback(
      () => runtime.getActionState<ControllerActionResult<TController>>(controllerToken),
      [controllerToken, runtime],
    ),
    React.useCallback(
      () => runtime.getActionState<ControllerActionResult<TController>>(controllerToken),
      [controllerToken, runtime],
    ),
  );
  const submit = React.useCallback(
    async (payload?: ControllerActionPayload<TController>) => {
      return (await runtime.action(controllerToken, payload)) as ControllerActionResult<TController> | undefined;
    },
    [controllerToken, runtime],
  );

  return React.useMemo(
    () => Object.assign(submit, { data: state.data, error: state.error, inProcess: state.inProcess }),
    [state, submit],
  ) as ControllerSubmit<ControllerActionPayload<TController>, ControllerActionResult<TController>>;
};
