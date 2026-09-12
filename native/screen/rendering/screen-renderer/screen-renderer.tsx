import React from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { runOnUISync } from 'react-native-worklets';

import { ScreenAnimation } from '../../declaration/screen-animation';
import type { ScreenTransitionOperation } from '../../declaration/screen-transition';
import { resolveScreenSceneRole, type ScreenMachineState, type ScreenSceneRole } from '../../runtime/screen-machine';
import { ScreenActivityProvider, useScreenActive } from '../../runtime/screen-activity-context';
import { ScreenRuntime, type ScreenSceneRuntime } from '../../runtime/screen-runtime';

export interface ScreenRendererProps {
  readonly onPresentationComplete?: (runtime: ScreenRuntime) => void;
  readonly runtime: ScreenRuntime;
  readonly style?: StyleProp<ViewStyle>;
}

const TRANSITION_DURATION: Readonly<Record<ScreenTransitionOperation, number>> = Object.freeze({
  dismiss: 200,
  present: 240,
});

export const ScreenRenderer: React.FC<ScreenRendererProps> = React.memo(
  ({ onPresentationComplete, runtime, style }) => {
    const progress = useSharedValue(runtime.getSnapshot().machine.phase === 'transitioning' ? 0 : 1);

    React.useLayoutEffect(() => {
      return runtime.subscribeTransitionStart(() => {
        runOnUISync(() => {
          'worklet';
          cancelAnimation(progress);
          progress.value = 0;
        });
      });
    }, [progress, runtime]);

    const snapshot = React.useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
    const machine = snapshot.machine;
    const finishTransition = React.useCallback(
      (transitionId: number) => runtime.completeTransition(transitionId),
      [runtime],
    );

    React.useLayoutEffect(() => {
      cancelAnimation(progress);

      if (machine.phase !== 'transitioning' || machine.incomingKey === null) {
        progress.value = 1;
        return;
      }

      const incoming = findPresentation(machine, machine.incomingKey);
      const transition = incoming.transition;

      if (!transition) {
        finishTransition(machine.transitionId);
        return;
      }

      const transitionId = machine.transitionId;
      const duration = TRANSITION_DURATION[transition.operation];

      progress.value = 0;
      progress.value = withTiming(1, { duration }, (finished) => {
        if (finished) runOnJS(finishTransition)(transitionId);
      });

      return () => cancelAnimation(progress);
    }, [finishTransition, machine.phase, machine.transitionId, progress]);

    return (
      <View pointerEvents={machine.phase === 'transitioning' ? 'none' : 'auto'} style={[styles.host, style]}>
        {snapshot.scenes.map((scene) => (
          <ScreenSceneView
            key={scene.key}
            machine={machine}
            onPresentationComplete={onPresentationComplete}
            owner={runtime}
            progress={progress}
            runtime={scene}
          />
        ))}
      </View>
    );
  },
);

interface ScreenSceneViewProps {
  readonly machine: ScreenMachineState;
  readonly onPresentationComplete?: (runtime: ScreenRuntime) => void;
  readonly owner: ScreenRuntime;
  readonly progress: SharedValue<number>;
  readonly runtime: ScreenSceneRuntime;
}

const ScreenSceneView: React.FC<ScreenSceneViewProps> = React.memo(
  ({ machine, onPresentationComplete, owner, progress, runtime }) => {
    const scene = React.useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
    const presentationActive = useScreenActive();
    const dimensions = useWindowDimensions();
    const role = resolveScreenSceneRole(machine, runtime.key);
    const incoming = machine.incomingKey ? findPresentation(machine, machine.incomingKey) : null;
    const animation = machine.phase === 'transitioning' ? incoming?.transition?.animation : undefined;
    const animatedStyle = useAnimatedStyle(() =>
      resolveAnimatedStyle(role, animation, progress.value, dimensions.width, dimensions.height),
    );
    const visible = role !== 'retained';
    const interactive = machine.phase === 'stable' && role === 'current';
    const active = presentationActive && interactive;

    React.useLayoutEffect(() => {
      if (interactive) onPresentationComplete?.(owner);
    }, [interactive, onPresentationComplete, owner, scene.content]);

    return (
      <Animated.View
        accessibilityElementsHidden={!interactive}
        aria-hidden={!interactive}
        importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
        pointerEvents={interactive ? 'auto' : 'none'}
        style={[styles.scene, animatedStyle]}
      >
        <React.Activity mode={visible ? 'visible' : 'hidden'}>
          <ScreenActivityProvider active={active}>{scene.content}</ScreenActivityProvider>
        </React.Activity>
      </Animated.View>
    );
  },
);

const findPresentation = (machine: ScreenMachineState, key: string) => {
  const presentation = machine.presentations.find((candidate) => candidate.key === key);

  if (!presentation) {
    throw new Error(`Screen presentation ${key} отсутствует в physical registry.`);
  }

  return presentation;
};

const resolveAnimatedStyle = (
  role: ScreenSceneRole,
  animation: ScreenAnimation | undefined,
  progress: number,
  width: number,
  height: number,
): { readonly opacity: number; readonly transform: readonly object[]; readonly zIndex: number } => {
  'worklet';

  if (role === 'retained') {
    return {
      opacity: 0,
      transform: [{ translateX: 0 }, { translateY: 0 }],
      zIndex: -1,
    };
  }

  if (role === 'current') {
    switch (animation) {
      case ScreenAnimation.SlideFromRight:
        return {
          opacity: 1,
          transform: [{ translateX: -width * 0.25 * progress }, { translateY: 0 }],
          zIndex: 0,
        };
      case ScreenAnimation.SlideFromLeft:
        return {
          opacity: 1,
          transform: [{ translateX: width * progress }, { translateY: 0 }],
          zIndex: 1,
        };
      default:
        return {
          opacity: 1,
          transform: [{ translateX: 0 }, { translateY: 0 }],
          zIndex: 0,
        };
    }
  }

  switch (animation) {
    case ScreenAnimation.Fade:
      return {
        opacity: progress,
        transform: [{ translateX: 0 }, { translateY: 0 }],
        zIndex: 1,
      };
    case ScreenAnimation.SlideFromBottom:
      return {
        opacity: 1,
        transform: [{ translateX: 0 }, { translateY: height * (1 - progress) }],
        zIndex: 1,
      };
    case ScreenAnimation.SlideFromLeft:
      return {
        opacity: 1,
        transform: [{ translateX: -width * 0.25 * (1 - progress) }, { translateY: 0 }],
        zIndex: 0,
      };
    case ScreenAnimation.SlideFromRight:
      return {
        opacity: 1,
        transform: [{ translateX: width * (1 - progress) }, { translateY: 0 }],
        zIndex: 1,
      };
    default:
      return {
        opacity: 1,
        transform: [{ translateX: 0 }, { translateY: 0 }],
        zIndex: 1,
      };
  }
};

const styles = StyleSheet.create({
  host: {
    flex: 1,
    overflow: 'hidden',
  },
  scene: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
