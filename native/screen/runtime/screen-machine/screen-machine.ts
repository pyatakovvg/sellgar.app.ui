import type { ScreenPresentation } from '../../declaration/screen-presentation';

export type ScreenSceneRole = 'current' | 'incoming' | 'retained';

export interface ScreenMachineState {
  readonly currentKey: string | null;
  readonly incomingKey: string | null;
  readonly phase: 'empty' | 'stable' | 'transitioning';
  readonly presentations: readonly ScreenPresentation[];
  readonly retainedKeys: readonly string[];
  readonly transitionId: number;
}

export const createScreenMachine = (): ScreenMachineState => {
  return createState({
    currentKey: null,
    incomingKey: null,
    phase: 'empty',
    presentations: EMPTY_PRESENTATIONS,
    retainedKeys: EMPTY_KEYS,
    transitionId: 0,
  });
};

export const presentScreen = (
  state: ScreenMachineState,
  presentation: ScreenPresentation | null,
  retainedPresentations: readonly ScreenPresentation[] = EMPTY_PRESENTATIONS,
): ScreenMachineState => {
  if (presentation === null) return createScreenMachine();

  assertPresentation(presentation);
  retainedPresentations.forEach(assertPresentation);

  const retainedKeys = uniqueKeys(retainedPresentations);
  const currentTargetKey = state.phase === 'transitioning' ? state.incomingKey : state.currentKey;
  const presentations = mergePresentations(
    retainedPresentations,
    presentation,
    state,
    currentTargetKey === presentation.key,
  );

  if (state.phase === 'empty') {
    if (presentation.transition === undefined) {
      return stableState(presentation.key, presentations, retainedKeys, state.transitionId + 1);
    }

    return transitionState(null, presentation.key, presentations, retainedKeys, state.transitionId + 1);
  }

  const targetKey = currentTargetKey;

  if (targetKey === presentation.key) {
    return state.phase === 'transitioning'
      ? transitionState(state.currentKey, presentation.key, presentations, retainedKeys, state.transitionId)
      : stableState(presentation.key, presentations, retainedKeys, state.transitionId);
  }

  if (state.phase === 'transitioning' && state.currentKey === presentation.key) {
    return stableState(presentation.key, presentations, retainedKeys, state.transitionId + 1);
  }

  if (presentation.transition === undefined) {
    return stableState(presentation.key, presentations, retainedKeys, state.transitionId + 1);
  }

  return transitionState(targetKey, presentation.key, presentations, retainedKeys, state.transitionId + 1);
};

export const completeScreenTransition = (state: ScreenMachineState, transitionId: number): ScreenMachineState => {
  if (state.phase !== 'transitioning' || state.transitionId !== transitionId || state.incomingKey === null) {
    return state;
  }

  return stableState(state.incomingKey, state.presentations, state.retainedKeys, state.transitionId);
};

export const resolveScreenSceneRole = (state: ScreenMachineState, key: string): ScreenSceneRole => {
  if (state.phase === 'transitioning') {
    if (state.incomingKey === key) return 'incoming';
    if (state.currentKey === key) return 'current';
  } else if (state.currentKey === key) {
    return 'current';
  }

  return 'retained';
};

const stableState = (
  currentKey: string,
  presentations: readonly ScreenPresentation[],
  retainedKeys: readonly string[],
  transitionId: number,
): ScreenMachineState => {
  return createState({
    currentKey,
    incomingKey: null,
    phase: 'stable',
    presentations: retainPresentations(presentations, new Set([...retainedKeys, currentKey])),
    retainedKeys,
    transitionId,
  });
};

const transitionState = (
  currentKey: string | null,
  incomingKey: string,
  presentations: readonly ScreenPresentation[],
  retainedKeys: readonly string[],
  transitionId: number,
): ScreenMachineState => {
  const visibleKeys = new Set([...retainedKeys, incomingKey]);

  if (currentKey !== null) visibleKeys.add(currentKey);

  return createState({
    currentKey,
    incomingKey,
    phase: 'transitioning',
    presentations: retainPresentations(presentations, visibleKeys),
    retainedKeys,
    transitionId,
  });
};

const mergePresentations = (
  retainedPresentations: readonly ScreenPresentation[],
  presentation: ScreenPresentation,
  state: ScreenMachineState,
  preserveTransition: boolean,
): readonly ScreenPresentation[] => {
  const byKey = new Map<string, ScreenPresentation>();

  for (const stored of state.presentations) byKey.set(stored.key, stored);
  for (const retained of retainedPresentations) {
    byKey.set(retained.key, refreshPresentation(byKey.get(retained.key), retained));
  }
  byKey.set(
    presentation.key,
    preserveTransition ? refreshPresentation(byKey.get(presentation.key), presentation) : presentation,
  );

  return Object.freeze([...byKey.values()]);
};

const refreshPresentation = (current: ScreenPresentation | undefined, next: ScreenPresentation): ScreenPresentation => {
  if (!current || current.transition === undefined) return next;

  return Object.freeze({ ...next, transition: current.transition });
};

const retainPresentations = (
  presentations: readonly ScreenPresentation[],
  keys: ReadonlySet<string>,
): readonly ScreenPresentation[] => {
  return Object.freeze(presentations.filter((presentation) => keys.has(presentation.key)));
};

const uniqueKeys = (presentations: readonly ScreenPresentation[]): readonly string[] => {
  return Object.freeze([...new Set(presentations.map((presentation) => presentation.key))]);
};

const createState = (state: ScreenMachineState): ScreenMachineState => Object.freeze(state);

const assertPresentation = (presentation: ScreenPresentation): void => {
  if (presentation.key.length === 0) {
    throw new Error('Screen presentation key не может быть пустым.');
  }
};

const EMPTY_KEYS: readonly string[] = Object.freeze([]);
const EMPTY_PRESENTATIONS: readonly ScreenPresentation[] = Object.freeze([]);
