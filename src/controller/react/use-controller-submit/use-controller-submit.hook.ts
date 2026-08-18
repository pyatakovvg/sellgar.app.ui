import React from 'react';

import type { DependencyToken } from '../../../di/token/dependency-token';
import type { ControllerActionPayload, ControllerActionResult } from '../../contract/controller';
import { useControllerRuntime } from '../controller-runtime-context';

type ControllerSubmitHandler<TPayload, TResult> = [TPayload] extends [never]
  ? () => Promise<TResult | undefined>
  : (payload: TPayload) => Promise<TResult | undefined>;

export type ControllerSubmit<TPayload, TResult> = ControllerSubmitHandler<TPayload, TResult> & {
  readonly data: TResult | undefined;
  readonly error: unknown;
  readonly inProcess: boolean;
};

export const useSubmit = <TController>(
  controller: DependencyToken<TController>,
): ControllerSubmit<ControllerActionPayload<TController>, ControllerActionResult<TController>> => {
  const runtime = useControllerRuntime();
  const state = React.useSyncExternalStore(
    React.useCallback(
      (onStoreChange) => {
        return runtime.subscribe(onStoreChange);
      },
      [runtime],
    ),
    React.useCallback(
      () =>
        runtime.getActionState(controller) as {
          readonly data: ControllerActionResult<TController> | undefined;
          readonly error: unknown;
          readonly inProcess: boolean;
        },
      [controller, runtime],
    ),
    React.useCallback(
      () =>
        runtime.getActionState(controller) as {
          readonly data: ControllerActionResult<TController> | undefined;
          readonly error: unknown;
          readonly inProcess: boolean;
        },
      [controller, runtime],
    ),
  );

  const submit = React.useCallback(
    async (payload?: ControllerActionPayload<TController>) => {
      return (await runtime.action(controller, payload)) as ControllerActionResult<TController>;
    },
    [controller, runtime],
  );

  return React.useMemo(
    () =>
      Object.assign(submit, {
        data: state.data,
        error: state.error,
        inProcess: state.inProcess,
      }) as ControllerSubmit<ControllerActionPayload<TController>, ControllerActionResult<TController>>,
    [state, submit],
  );
};
