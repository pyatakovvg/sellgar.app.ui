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

import { ScreenAnimation } from '../../declaration/screen-animation';
import type { ScreenPresentation } from '../../declaration/screen-presentation';
import type { ScreenTransitionOperation } from '../../declaration/screen-transition';
import {
  completeScreenTransition,
  createScreenMachine,
  presentScreen,
  resolveScreenSlotPresentation,
  resolveScreenSlotRole,
  type ScreenMachineState,
  type ScreenSlot,
} from '../../runtime/screen-machine';
import { ScreenActivityProvider, useScreenActive } from '../../runtime/screen-activity-context';

export interface ScreenRendererProps {
  readonly onPresentationComplete?: () => void;
  readonly presentation: ScreenPresentation | null;
  readonly style?: StyleProp<ViewStyle>;
}

const TRANSITION_DURATION: Readonly<Record<ScreenTransitionOperation, number>> = Object.freeze({
  dismiss: 200,
  present: 240,
});

export const ScreenRenderer: React.FC<ScreenRendererProps> = ({ onPresentationComplete, presentation, style }) => {
  const [state, setState] = React.useState<ScreenMachineState>(createScreenMachine);
  const progress = useSharedValue(1);

  React.useLayoutEffect(() => {
    setState((current) => presentScreen(current, presentation));
  }, [presentation]);

  const finishTransition = React.useCallback((transitionId: number) => {
    setState((current) => completeScreenTransition(current, transitionId));
  }, []);

  React.useLayoutEffect(() => {
    cancelAnimation(progress);

    if (state.phase !== 'transitioning') {
      progress.value = 1;
      return;
    }

    const transitionId = state.transitionId;
    const duration = TRANSITION_DURATION[state.incoming.transition!.operation];

    progress.value = 0;
    progress.value = withTiming(1, { duration }, (finished) => {
      if (finished) runOnJS(finishTransition)(transitionId);
    });

    return () => cancelAnimation(progress);
  }, [finishTransition, progress, state.phase, state.transitionId]);

  React.useEffect(() => {
    if (state.phase === 'stable' && presentation !== null && state.current.key === presentation.key) {
      onPresentationComplete?.();
    }
  }, [onPresentationComplete, presentation?.key, state.current?.key, state.phase]);

  return (
    <View pointerEvents={state.phase === 'transitioning' ? 'none' : 'auto'} style={[styles.host, style]}>
      <ScreenSlotView progress={progress} slot="primary" state={state} />
      <ScreenSlotView progress={progress} slot="secondary" state={state} />
    </View>
  );
};

interface ScreenSlotViewProps {
  readonly progress: SharedValue<number>;
  readonly slot: ScreenSlot;
  readonly state: ScreenMachineState;
}

const ScreenSlotView: React.FC<ScreenSlotViewProps> = ({ progress, slot, state }) => {
  const presentationActive = useScreenActive();
  const dimensions = useWindowDimensions();
  const presentation = resolveScreenSlotPresentation(state, slot);
  const role = resolveScreenSlotRole(state, slot);
  const animation = state.phase === 'transitioning' ? state.incoming.transition?.animation : undefined;
  const animatedStyle = useAnimatedStyle(() => {
    const value = progress.value;

    if (role === 'empty') {
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
            transform: [{ translateX: -dimensions.width * 0.25 * value }, { translateY: 0 }],
            zIndex: 0,
          };
        case ScreenAnimation.SlideFromLeft:
          return {
            opacity: 1,
            transform: [{ translateX: dimensions.width * value }, { translateY: 0 }],
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
          opacity: value,
          transform: [{ translateX: 0 }, { translateY: 0 }],
          zIndex: 1,
        };
      case ScreenAnimation.SlideFromBottom:
        return {
          opacity: 1,
          transform: [{ translateX: 0 }, { translateY: dimensions.height * (1 - value) }],
          zIndex: 1,
        };
      case ScreenAnimation.SlideFromLeft:
        return {
          opacity: 1,
          transform: [{ translateX: -dimensions.width * 0.25 * (1 - value) }, { translateY: 0 }],
          zIndex: 0,
        };
      case ScreenAnimation.SlideFromRight:
        return {
          opacity: 1,
          transform: [{ translateX: dimensions.width * (1 - value) }, { translateY: 0 }],
          zIndex: 1,
        };
      default:
        return {
          opacity: 1,
          transform: [{ translateX: 0 }, { translateY: 0 }],
          zIndex: 1,
        };
    }
  }, [animation, dimensions.height, dimensions.width, role]);
  const visible = role !== 'empty';
  const interactive = state.phase === 'stable' && role === 'current';
  const active = presentationActive && interactive;

  return (
    <Animated.View
      accessibilityElementsHidden={!interactive}
      aria-hidden={!interactive}
      importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
      pointerEvents={interactive ? 'auto' : 'none'}
      style={[styles.slot, animatedStyle]}
    >
      <ScreenActivityProvider active={active}>
        {visible && presentation ? <React.Fragment key={presentation.key}>{presentation.content}</React.Fragment> : null}
      </ScreenActivityProvider>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  host: {
    flex: 1,
    overflow: 'hidden',
  },
  slot: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
