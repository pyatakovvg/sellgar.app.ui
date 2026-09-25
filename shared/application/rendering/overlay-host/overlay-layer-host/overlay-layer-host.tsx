import { FloatingPortal } from '@floating-ui/react';
import React from 'react';
import ReactDOM from 'react-dom';

import { PresentationLayer, type PresentationLayerValue } from '../../presentation-layer';

import s from './default.module.scss';

interface IProps {
  readonly children: React.ReactNode;
  readonly layer: Exclude<PresentationLayerValue, 'application'>;
}

export const OverlayLayerHost: React.FC<IProps> = (props) => {
  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const handleRoot = React.useCallback((element: HTMLDivElement | null) => {
    setRoot(element);
  }, []);

  if (typeof document === 'undefined') {
    return null;
  }

  return ReactDOM.createPortal(
    <div
      ref={handleRoot}
      className={s.wrapper}
      data-floating-ui-ignore-outside-press={props.layer !== PresentationLayer.Frame ? '' : undefined}
      data-tiyn-overlay-layer={props.layer}
    >
      {root ? <FloatingPortal root={root}>{props.children}</FloatingPortal> : null}
    </div>,
    document.body,
    props.layer,
  );
};
