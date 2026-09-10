import React from 'react';
import { I18nManager, Platform, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

interface NativeBackGestureHostProps {
  readonly children: React.ReactElement;
  readonly requestBack: () => void | Promise<void>;
}

const ACTIVATION_DISTANCE = 12;
const COMMIT_DISTANCE = 72;
const COMMIT_VELOCITY = 600;
const EDGE_WIDTH = 32;
const VERTICAL_TOLERANCE = 24;

/** Converts the iOS leading-edge gesture into the same logical Back intent as Android BackHandler. */
export const NativeBackGestureHost: React.FC<NativeBackGestureHostProps> = ({ children, requestBack }) => {
  if (Platform.OS !== 'ios') return children;

  return <IosBackGestureHost requestBack={requestBack}>{children}</IosBackGestureHost>;
};

const IosBackGestureHost: React.FC<NativeBackGestureHostProps> = ({ children, requestBack }) => {
  const direction = I18nManager.isRTL ? -1 : 1;
  const invokeBack = React.useCallback(() => void requestBack(), [requestBack]);
  const gesture = usePanGesture({
    activeOffsetX: direction * ACTIVATION_DISTANCE,
    enabled: Platform.OS === 'ios',
    failOffsetY: [-VERTICAL_TOLERANCE, VERTICAL_TOLERANCE],
    hitSlop: I18nManager.isRTL ? { right: 0, width: EDGE_WIDTH } : { left: 0, width: EDGE_WIDTH },
    onDeactivate: (event) => {
      if (event.canceled) return;

      const distance = direction * event.translationX;
      const velocity = direction * event.velocityX;

      if (distance >= COMMIT_DISTANCE || velocity >= COMMIT_VELOCITY) {
        scheduleOnRN(invokeBack);
      }
    },
  });

  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false} style={styles.host}>
        {children}
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
});
