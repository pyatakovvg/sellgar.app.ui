import React from 'react';

import { PresentationLayer } from '../presentation-layer';
import { OverlayLayerHost } from './overlay-layer-host';

interface IProps {
  readonly children: React.ReactNode;
  readonly frame: React.ReactNode;
  readonly modal: React.ReactNode;
  readonly notification: React.ReactNode;
}

export const OverlayHost: React.FC<IProps> = (props) => {
  return (
    <>
      {props.children}
      <OverlayLayerHost layer={PresentationLayer.Frame}>{props.frame}</OverlayLayerHost>
      <OverlayLayerHost layer={PresentationLayer.Modal}>{props.modal}</OverlayLayerHost>
      <OverlayLayerHost layer={PresentationLayer.Notification}>{props.notification}</OverlayLayerHost>
    </>
  );
};
