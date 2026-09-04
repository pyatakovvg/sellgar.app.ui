import React from 'react';

import type { NavigationState } from '../../../../core/router/runtime/navigation-state';
import type { NativeRouterBridge } from '../../bridge/native-router-bridge';
import { resolveNativeFrameTransition, type NativeFrameTransition } from './native-frame-transition.ts';

type NativePresentationParticipant = 'frame' | 'screen';

interface NativePresentationCycleState {
  readonly completed: Set<NativePresentationParticipant>;
  readonly requiresFrame: boolean;
  readonly revision: number;
}

export interface NativePresentationCycle {
  readonly completeFrame: () => void;
  readonly completeScreen: () => void;
  readonly frame: NativeFrameTransition | null;
}

export const useNativePresentationCycle = (
  bridge: NativeRouterBridge,
  current: NavigationState | undefined,
  target: NavigationState | null,
): NativePresentationCycle => {
  React.useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot);

  const revision = bridge.getPendingPresentationRevision();
  const source = bridge.getPresentedNavigation() ?? current;
  const presentationTarget = target ?? (revision === null ? null : current ?? null);
  const frame = resolveNativeFrameTransition(source, presentationTarget, revision);
  const state = React.useRef<NativePresentationCycleState | null>(null);

  if (revision !== null && state.current?.revision !== revision) {
    state.current = {
      completed: new Set(),
      requiresFrame: frame !== null,
      revision,
    };
  }

  const complete = React.useCallback(
    (participant: NativePresentationParticipant, completedRevision: number | null) => {
      if (completedRevision === null) return;

      const cycle = state.current;

      if (!cycle || cycle.revision !== completedRevision) return;

      cycle.completed.add(participant);

      if (!cycle.completed.has('screen') || (cycle.requiresFrame && !cycle.completed.has('frame'))) return;

      bridge.completePresentation(completedRevision);
    },
    [bridge],
  );
  const completeFrame = React.useCallback(() => complete('frame', revision), [complete, revision]);
  const completeScreen = React.useCallback(() => complete('screen', revision), [complete, revision]);

  return React.useMemo(
    () => ({ completeFrame, completeScreen, frame }),
    [completeFrame, completeScreen, frame],
  );
};
