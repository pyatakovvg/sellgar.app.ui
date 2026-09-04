import { describe, expect, it } from 'vitest';

import type { DependencyToken } from '../../../di/token/dependency-token';
import { resolveRuntimeRevalidateState, type RuntimeRevalidateState } from './revalidate-state.ts';

describe('resolveRuntimeRevalidateState', () => {
  it('implements general aggregation and exact-token process attribution', () => {
    const generalError = new Error('general failed');
    const targetedError = new Error('targeted failed');

    expect(resolveRuntimeRevalidateState(undefined, { error: generalError, inProcess: true }, createStates())).toEqual({
      error: generalError,
      inProcess: true,
    });
    expect(
      resolveRuntimeRevalidateState(ControllerA, { error: generalError, inProcess: true }, createStates()),
    ).toEqual({ error: undefined, inProcess: false });

    const targetedA = createStates([ControllerA, { error: targetedError, inProcess: true }]);

    expect(resolveRuntimeRevalidateState(undefined, IDLE_STATE, targetedA)).toEqual({
      error: targetedError,
      inProcess: true,
    });
    expect(resolveRuntimeRevalidateState(ControllerA, IDLE_STATE, targetedA)).toEqual({
      error: targetedError,
      inProcess: true,
    });
    expect(resolveRuntimeRevalidateState(ControllerB, IDLE_STATE, targetedA)).toEqual({
      error: undefined,
      inProcess: false,
    });

    const targetedB = createStates([ControllerB, { error: undefined, inProcess: true }]);

    expect(resolveRuntimeRevalidateState(undefined, IDLE_STATE, targetedB).inProcess).toBe(true);
    expect(resolveRuntimeRevalidateState(ControllerA, IDLE_STATE, targetedB).inProcess).toBe(false);
    expect(resolveRuntimeRevalidateState(ControllerB, IDLE_STATE, targetedB).inProcess).toBe(true);
  });
});

const IDLE_STATE: RuntimeRevalidateState = Object.freeze({
  error: undefined,
  inProcess: false,
});

class ControllerA {}
class ControllerB {}

const createStates = (
  ...entries: Array<[DependencyToken<unknown>, RuntimeRevalidateState]>
): ReadonlyMap<DependencyToken<unknown>, RuntimeRevalidateState> => {
  return new Map(entries);
};
