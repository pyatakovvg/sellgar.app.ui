import type { ScreenPresentation } from '../../declaration/screen-presentation';

export type ScreenSlot = 'primary' | 'secondary';

export type ScreenMachineState = ScreenMachineEmptyState | ScreenMachineStableState | ScreenMachineTransitionState;

export interface ScreenMachineEmptyState {
  readonly current: null;
  readonly currentSlot: ScreenSlot;
  readonly incoming: null;
  readonly phase: 'empty';
  readonly transitionId: number;
}

export interface ScreenMachineStableState {
  readonly current: ScreenPresentation;
  readonly currentSlot: ScreenSlot;
  readonly incoming: null;
  readonly phase: 'stable';
  readonly transitionId: number;
}

export interface ScreenMachineTransitionState {
  readonly current: ScreenPresentation | null;
  readonly currentSlot: ScreenSlot;
  readonly incoming: ScreenPresentation;
  readonly phase: 'transitioning';
  readonly transitionId: number;
}

export const createScreenMachine = (): ScreenMachineState => {
  return emptyState('primary', 0);
};

export const presentScreen = (
  state: ScreenMachineState,
  presentation: ScreenPresentation | null,
): ScreenMachineState => {
  if (presentation === null) {
    if (state.phase === 'empty') return state;
    return emptyState(state.currentSlot, state.transitionId + 1);
  }

  assertPresentation(presentation);

  if (state.phase === 'empty') {
    if (presentation.transition === undefined) {
      return stableState(presentation, state.currentSlot, state.transitionId + 1);
    }

    return transitionState(null, presentation, state.currentSlot, state.transitionId + 1);
  }

  if (state.phase === 'stable') {
    if (state.current.key === presentation.key) {
      return stableState(refreshPresentation(state.current, presentation), state.currentSlot, state.transitionId);
    }

    if (presentation.transition === undefined) {
      return stableState(presentation, oppositeSlot(state.currentSlot), state.transitionId + 1);
    }

    return transitionState(state.current, presentation, state.currentSlot, state.transitionId + 1);
  }

  if (state.incoming.key === presentation.key) {
    return transitionState(
      state.current,
      refreshPresentation(state.incoming, presentation),
      state.currentSlot,
      state.transitionId,
    );
  }

  if (state.current?.key === presentation.key) {
    return stableState(refreshPresentation(state.current, presentation), state.currentSlot, state.transitionId + 1);
  }

  if (presentation.transition === undefined) {
    return stableState(presentation, oppositeSlot(state.currentSlot), state.transitionId + 1);
  }

  return transitionState(state.incoming, presentation, oppositeSlot(state.currentSlot), state.transitionId + 1);
};

export const completeScreenTransition = (state: ScreenMachineState, transitionId: number): ScreenMachineState => {
  if (state.phase !== 'transitioning' || state.transitionId !== transitionId) return state;

  return stableState(state.incoming, oppositeSlot(state.currentSlot), state.transitionId);
};

export const resolveScreenSlotPresentation = (
  state: ScreenMachineState,
  slot: ScreenSlot,
): ScreenPresentation | null => {
  if (state.phase === 'empty') return null;
  if (slot === state.currentSlot) return state.current;
  if (state.phase === 'transitioning') return state.incoming;
  return null;
};

export const resolveScreenSlotRole = (
  state: ScreenMachineState,
  slot: ScreenSlot,
): 'current' | 'incoming' | 'empty' => {
  if (state.phase === 'empty') return 'empty';
  if (slot === state.currentSlot && state.current !== null) return 'current';
  if (state.phase === 'transitioning' && slot !== state.currentSlot) return 'incoming';
  return 'empty';
};

const emptyState = (currentSlot: ScreenSlot, transitionId: number): ScreenMachineEmptyState => {
  return Object.freeze({
    current: null,
    currentSlot,
    incoming: null,
    phase: 'empty',
    transitionId,
  });
};

const stableState = (
  current: ScreenPresentation,
  currentSlot: ScreenSlot,
  transitionId: number,
): ScreenMachineStableState => {
  return Object.freeze({
    current,
    currentSlot,
    incoming: null,
    phase: 'stable',
    transitionId,
  });
};

const transitionState = (
  current: ScreenPresentation | null,
  incoming: ScreenPresentation,
  currentSlot: ScreenSlot,
  transitionId: number,
): ScreenMachineTransitionState => {
  return Object.freeze({
    current,
    currentSlot,
    incoming,
    phase: 'transitioning',
    transitionId,
  });
};

const refreshPresentation = (current: ScreenPresentation, next: ScreenPresentation): ScreenPresentation => {
  return Object.freeze({
    ...next,
    transition: current.transition,
  });
};

const oppositeSlot = (slot: ScreenSlot): ScreenSlot => {
  return slot === 'primary' ? 'secondary' : 'primary';
};

const assertPresentation = (presentation: ScreenPresentation): void => {
  if (presentation.key.length === 0) {
    throw new Error('Screen presentation key не может быть пустым.');
  }
};
