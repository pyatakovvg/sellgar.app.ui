import React from 'react';
import { StyleSheet, View } from 'react-native';

import { KeyboardSurface } from '../../../keyboard/rendering/keyboard-surface';
import { KeyboardRuntimeProvider } from '../../../keyboard/runtime/keyboard-runtime-context';
import { ScreenCompositor, ScreenLayerHost } from '../../../screen/rendering/screen-compositor';

interface OverlayHostProps {
  readonly children: React.ReactNode;
  readonly frame: React.ReactNode;
  readonly modal: React.ReactNode;
  readonly notification: React.ReactNode;
}

export const OverlayHost: React.FC<OverlayHostProps> = (props) => {
  return (
    <KeyboardSurface>
      <KeyboardRuntimeProvider>
        <ScreenCompositor>
          <View style={styles.root}>
            <View style={styles.application}>
              <ScreenLayerHost kind="application">{props.children}</ScreenLayerHost>
            </View>
            <View collapsable={false} pointerEvents="box-none" style={styles.frame}>
              {props.frame}
            </View>
            {props.modal}
            {props.notification}
          </View>
        </ScreenCompositor>
      </KeyboardRuntimeProvider>
    </KeyboardSurface>
  );
};

const styles = StyleSheet.create({
  application: {
    flex: 1,
  },
  frame: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 100,
  },
  root: {
    flex: 1,
  },
});
