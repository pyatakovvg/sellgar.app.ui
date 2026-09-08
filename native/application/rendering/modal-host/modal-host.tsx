import React from 'react';
import { Modal, StyleSheet } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import type { ScreenPresentation } from '../../../screen/declaration/screen-presentation';
import { ScreenLayerHost } from '../../../screen/rendering/screen-compositor';
import { ScreenActivityGate } from '../../../screen/runtime/screen-activity-context';

interface ModalHostProps {
  readonly onRequestClose: () => void;
  readonly presentation: ScreenPresentation;
}

export const ModalHost: React.FC<ModalHostProps> = (props) => {
  const [shown, setShown] = React.useState(false);

  return (
    <ScreenLayerHost kind="modal">
      <Modal
        animationType="none"
        onRequestClose={props.onRequestClose}
        onShow={() => setShown(true)}
        transparent
        visible
      >
        <ScreenActivityGate active={shown}>
          <KeyboardAvoidingView automaticOffset behavior="padding" style={styles.screen}>
            {props.presentation.content}
          </KeyboardAvoidingView>
        </ScreenActivityGate>
      </Modal>
    </ScreenLayerHost>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
