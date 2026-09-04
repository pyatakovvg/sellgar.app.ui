import type { DependencyToken } from '../../../di/token/dependency-token';

export interface RuntimeRevalidateState {
  readonly error: unknown;
  readonly inProcess: boolean;
}

export const resolveRuntimeRevalidateState = (
  controllerToken: DependencyToken<unknown> | undefined,
  generalState: RuntimeRevalidateState,
  targetedStates: ReadonlyMap<DependencyToken<unknown>, RuntimeRevalidateState>,
): RuntimeRevalidateState => {
  if (controllerToken !== undefined) {
    const state = targetedStates.get(controllerToken) ?? EMPTY_REVALIDATE_STATE;

    return {
      error: state.error,
      inProcess: state.inProcess,
    };
  }

  let error = generalState.error;
  let inProcess = generalState.inProcess;

  for (const state of targetedStates.values()) {
    error ??= state.error;
    inProcess ||= state.inProcess;
  }

  return { error, inProcess };
};

const EMPTY_REVALIDATE_STATE: RuntimeRevalidateState = Object.freeze({
  error: undefined,
  inProcess: false,
});
