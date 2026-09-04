import React from 'react';
import { Modal, StyleSheet } from 'react-native';

import type { ScreenPresentation } from '../../../screen/declaration/screen-presentation';
import { ScreenLayerHost } from '../../../screen/rendering/screen-compositor';
import { ScreenRenderer } from '../../../screen/rendering/screen-renderer';
import { ScreenActivityGate } from '../../../screen/runtime/screen-activity-context';

interface ModalHostProps {
  readonly onRequestClose: () => void;
  readonly presentation: ScreenPresentation;
}

export const ModalHost: React.FC<ModalHostProps> = (props) => {
  const [shown, setShown] = React.useState(false);

  return (
    <ScreenLayerHost kind="modal">
      <Modal animationType="none" onRequestClose={props.onRequestClose} onShow={() => setShown(true)} transparent visible>
        <ScreenActivityGate active={shown}>
          <ScreenRenderer presentation={props.presentation} style={styles.screen} />
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
