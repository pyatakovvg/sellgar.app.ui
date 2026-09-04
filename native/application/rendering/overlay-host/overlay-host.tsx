import React from 'react';

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
          <ScreenLayerHost kind="application">{props.children}</ScreenLayerHost>
          {props.frame}
          {props.modal}
          {props.notification}
        </ScreenCompositor>
      </KeyboardRuntimeProvider>
    </KeyboardSurface>
  );
};
