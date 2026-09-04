import React from 'react';
import { Keyboard, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, GestureStateManager, usePanGesture } from 'react-native-gesture-handler';
import { KeyboardAvoidingView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { ShellContextInterface, ShellMetadata } from '../../declaration/shell';
import {
  ShellRuntimeProvider,
  type ShellRuntimeContextValue,
  type ShellScrollBounds,
} from '../../runtime/shell-runtime-context';
import { renderView } from '../../../view/renderable-view';
import { useShellDismissRequest } from './shell-dismiss-request.ts';
import { shouldCommitShellDismiss } from './shell-dismiss.ts';
import { isTouchWithinShellScrollBounds, resolveShellPanIntent } from './shell-pan-intent.ts';

interface ShellHostProps {
  readonly children: React.ReactNode;
  readonly dismiss: () => void | Promise<void>;
  readonly metadata: ShellMetadata;
  readonly onPresentationComplete: () => void;
  readonly phase: 'dismissing' | 'presenting' | 'visible';
  readonly presentationRevision: number | null;
}

const DISMISS_DURATION = 180;
const HORIZONTAL_TOLERANCE = 24;
const PRESENT_DURATION = 220;
const VERTICAL_ACTIVATION_DISTANCE = 8;

export const ShellHost: React.FC<ShellHostProps> = (props) => {
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const { dismiss } = props;
  const requestDismiss = useShellDismissRequest(dismiss);
  const translationY = useSharedValue(0);
  const frameHeight = useSharedValue(1);
  const frameMeasured = useSharedValue(0);
  const interactiveDismissStarted = useSharedValue(false);
  const reportedPresentationRevision = React.useRef<number | null>(null);
  const scrollBounds = useSharedValue<ShellScrollBounds | null>(null);
  const scrollOffset = useSharedValue(0);
  const initialTouchX = useSharedValue(0);
  const initialTouchY = useSharedValue(0);
  const activationTranslationY = useSharedValue(0);
  const gestureActivated = useSharedValue(false);
  const touchStartedInScrollable = useSharedValue(false);
  const touchStartedWithKeyboard = useSharedValue(false);
  const keyboardDismissRequested = useSharedValue(false);
  const completePresentation = React.useCallback(() => {
    if (
      props.presentationRevision === null ||
      reportedPresentationRevision.current === props.presentationRevision
    ) {
      return;
    }

    reportedPresentationRevision.current = props.presentationRevision;
    props.onPresentationComplete();
  }, [props.onPresentationComplete, props.presentationRevision]);
  const animateInteractiveDismiss = React.useCallback(() => {
    'worklet';

    if (interactiveDismissStarted.value) return;

    interactiveDismissStarted.value = true;
    cancelAnimation(translationY);
    translationY.value = withTiming(frameHeight.value, { duration: DISMISS_DURATION }, (finished) => {
      if (finished) scheduleOnRN(requestDismiss);
    });
  }, [frameHeight, interactiveDismissStarted, requestDismiss, translationY]);
  const animatePresentationDismiss = React.useCallback(() => {
    cancelAnimation(translationY);

    if (translationY.value >= frameHeight.value - 0.5) {
      completePresentation();
      return;
    }

    translationY.value = withTiming(frameHeight.value, { duration: DISMISS_DURATION }, (finished) => {
      if (finished) scheduleOnRN(completePresentation);
    });
  }, [completePresentation, frameHeight, translationY]);
  const ensurePresentationVisible = React.useCallback(() => {
    cancelAnimation(translationY);

    if (frameMeasured.value > 0 && translationY.value <= 0.5) {
      completePresentation();
      return;
    }

    translationY.value = withTiming(0, { duration: PRESENT_DURATION }, (finished) => {
      if (finished) scheduleOnRN(completePresentation);
    });
  }, [completePresentation, frameMeasured, translationY]);

  React.useEffect(() => {
    if (props.phase === 'dismissing') animatePresentationDismiss();
    if (props.phase === 'presenting') ensurePresentationVisible();
  }, [animatePresentationDismiss, ensurePresentationVisible, props.phase, props.presentationRevision]);

  const gesture = usePanGesture({
    manualActivation: true,
    onBegin: () => {
      if (interactiveDismissStarted.value) return;

      cancelAnimation(translationY);
      gestureActivated.value = false;
      keyboardDismissRequested.value = false;
    },
    onTouchesDown: (event) => {
      const touch = event.allTouches[0];

      if (!touch) return;

      initialTouchX.value = touch.absoluteX;
      initialTouchY.value = touch.absoluteY;
      touchStartedInScrollable.value = isTouchWithinShellScrollBounds(touch.absoluteY, scrollBounds.value);
      touchStartedWithKeyboard.value = keyboardHeight.value !== 0;
    },
    onTouchesMove: (event) => {
      const touch = event.allTouches[0];

      if (!touch) return;

      if (interactiveDismissStarted.value) {
        GestureStateManager.fail(event.handlerTag);
        return;
      }

      const intent = resolveShellPanIntent({
        deltaX: touch.absoluteX - initialTouchX.value,
        deltaY: touch.absoluteY - initialTouchY.value,
        horizontalTolerance: HORIZONTAL_TOLERANCE,
        scrollOffset: touchStartedInScrollable.value ? scrollOffset.value : 0,
        verticalActivationDistance: VERTICAL_ACTIVATION_DISTANCE,
      });

      if (touchStartedWithKeyboard.value) {
        if (intent === 'activate' && !keyboardDismissRequested.value) {
          keyboardDismissRequested.value = true;
          scheduleOnRN(dismissKeyboard);
        }

        if (intent !== 'wait') GestureStateManager.fail(event.handlerTag);
        return;
      }

      if (intent === 'activate') GestureStateManager.activate(event.handlerTag);
      if (intent === 'fail') GestureStateManager.fail(event.handlerTag);
    },
    onActivate: (event) => {
      gestureActivated.value = true;
      activationTranslationY.value = event.translationY;
    },
    onUpdate: (event) => {
      translationY.value = Math.max(0, event.translationY - activationTranslationY.value);
    },
    onDeactivate: (event) => {
      if (event.canceled) {
        translationY.value = createReturnAnimation(event.velocityY);
        return;
      }

      const shouldDismiss = shouldCommitShellDismiss({
        distance: translationY.value,
        height: frameHeight.value,
        velocityY: event.velocityY,
      });

      if (!shouldDismiss) {
        translationY.value = createReturnAnimation(event.velocityY);
        return;
      }

      animateInteractiveDismiss();
    },
    onFinalize: () => {
      if (interactiveDismissStarted.value) return;

      if (!gestureActivated.value && translationY.value > 0) {
        translationY.value = createReturnAnimation();
      }

      gestureActivated.value = false;
      keyboardDismissRequested.value = false;
      touchStartedWithKeyboard.value = false;
    },
  });
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: frameMeasured.value * interpolate(translationY.value, [0, frameHeight.value], [1, 0], Extrapolation.CLAMP),
  }));
  const frameStyle = useAnimatedStyle(() => ({
    opacity: frameMeasured.value,
    transform: [{ translateY: translationY.value }],
  }));
  const context: ShellContextInterface = React.useMemo(() => ({ children: props.children }), [props.children]);
  const runtime: ShellRuntimeContextValue = React.useMemo(
    () => ({ controller: { close: requestDismiss }, dismissGesture: gesture, scrollBounds, scrollOffset }),
    [gesture, requestDismiss, scrollBounds, scrollOffset],
  );
  const handleFrameLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const height = Math.max(event.nativeEvent.layout.height, 1);

      frameHeight.value = height;

      if (frameMeasured.value > 0) return;

      translationY.value = height;
      frameMeasured.value = 1;
      translationY.value = withTiming(0, { duration: PRESENT_DURATION }, (finished) => {
        if (finished && props.phase === 'presenting') scheduleOnRN(completePresentation);
      });
    },
    [completePresentation, frameHeight, frameMeasured, props.phase, translationY],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View accessibilityViewIsModal style={[StyleSheet.absoluteFill, styles.overlay]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
        <KeyboardAvoidingView
          automaticOffset
          behavior="padding"
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, styles.framePosition]}
        >
          <Animated.View onLayout={handleFrameLayout} style={[styles.frame, frameStyle]}>
            <ShellRuntimeProvider value={runtime}>{renderView(props.metadata.view, context)}</ShellRuntimeProvider>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.56)',
  },
  frame: {
    maxHeight: '100%',
  },
  framePosition: {
    justifyContent: 'flex-end',
  },
  overlay: {
    zIndex: 10,
  },
});

const createReturnAnimation = (velocity = 0) => {
  'worklet';

  return withSpring(0, {
    damping: 28,
    overshootClamping: true,
    stiffness: 320,
    velocity,
  });
};

const dismissKeyboard = () => Keyboard.dismiss();
