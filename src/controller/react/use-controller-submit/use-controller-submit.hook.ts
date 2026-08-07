import React from 'react';
import { useFetcher } from 'react-router';

import type { DependencyToken } from '../../../di/token/dependency-token';
import type { FrameRuntime } from '../../../frame/runtime/frame-runtime';
import { MODULE_ACTION_ID_FIELD, type ModuleRuntime } from '../../../module/runtime/module-runtime';
import type { WidgetRuntime } from '../../../widget/runtime/widget-runtime';
import type { ControllerActionPayload, ControllerActionResult } from '../../contract/controller';
import { useControllerRuntime } from '../controller-runtime-context';

export type ControllerSubmit<TPayload, TResult> = ((payload: TPayload) => Promise<TResult | undefined>) & {
  readonly data: TResult | undefined;
  readonly error: unknown;
  readonly inProcess: boolean;
};

export const useSubmit = <TController>(
  controller: DependencyToken<TController>,
): ControllerSubmit<ControllerActionPayload<TController>, ControllerActionResult<TController>> => {
  const controllerRuntime = useControllerRuntime();
  const moduleSubmit = useModuleSubmit(
    controller,
    controllerRuntime.kind === 'module' ? controllerRuntime.runtime : null,
  );
  const runtimeSubmit = useRuntimeSubmit(
    controller,
    controllerRuntime.kind === 'frame' || controllerRuntime.kind === 'widget' ? controllerRuntime.runtime : null,
  );

  return controllerRuntime.kind === 'module' ? moduleSubmit : runtimeSubmit;
};

const useModuleSubmit = <TController>(
  controller: DependencyToken<TController>,
  runtime: ModuleRuntime | null,
): ControllerSubmit<ControllerActionPayload<TController>, ControllerActionResult<TController>> => {
  const fetcher = useFetcher();
  const state = React.useSyncExternalStore(
    React.useCallback(
      (onStoreChange) => {
        return runtime?.subscribe(onStoreChange) ?? (() => {});
      },
      [runtime],
    ),
    React.useCallback(
      () => runtime?.getActionState<ControllerActionResult<TController>>(controller) ?? DEFAULT_CONTROLLER_SUBMIT_STATE,
      [controller, runtime],
    ),
    React.useCallback(
      () => runtime?.getActionState<ControllerActionResult<TController>>(controller) ?? DEFAULT_CONTROLLER_SUBMIT_STATE,
      [controller, runtime],
    ),
  );

  const submit = React.useCallback(
    async (payload: ControllerActionPayload<TController>) => {
      if (runtime === null) {
        throw new Error('Действие контроллера недоступно в текущем runtime entity.');
      }

      const operation = runtime.startAction(controller, payload);
      const body = new FormData();

      body.set(MODULE_ACTION_ID_FIELD, operation.id);

      try {
        await fetcher.submit(body, {
          method: 'post',
        });
      } catch (error) {
        runtime.failAction(operation.id, error);
      }

      return runtime.finishAction<ControllerActionResult<TController>>(operation);
    },
    [controller, fetcher, runtime],
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

type RuntimeSubmitRuntime = FrameRuntime<object> | WidgetRuntime<object>;

const useRuntimeSubmit = <TController>(
  controller: DependencyToken<TController>,
  runtime: RuntimeSubmitRuntime | null,
): ControllerSubmit<ControllerActionPayload<TController>, ControllerActionResult<TController>> => {
  const state = React.useSyncExternalStore(
    React.useCallback(
      (onStoreChange) => {
        return runtime?.subscribe(onStoreChange) ?? (() => {});
      },
      [runtime],
    ),
    React.useCallback(
      () => runtime?.getActionState<ControllerActionResult<TController>>(controller) ?? DEFAULT_CONTROLLER_SUBMIT_STATE,
      [controller, runtime],
    ),
    React.useCallback(
      () => runtime?.getActionState<ControllerActionResult<TController>>(controller) ?? DEFAULT_CONTROLLER_SUBMIT_STATE,
      [controller, runtime],
    ),
  );

  const submit = React.useCallback(
    async (payload: ControllerActionPayload<TController>) => {
      if (runtime === null) {
        throw new Error('Действие контроллера недоступно в текущем runtime entity.');
      }

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

interface ControllerSubmitState<TResult = unknown> {
  readonly data: TResult | undefined;
  readonly error: unknown;
  readonly inProcess: boolean;
}

const DEFAULT_CONTROLLER_SUBMIT_STATE: ControllerSubmitState = {
  data: undefined,
  error: undefined,
  inProcess: false,
};
