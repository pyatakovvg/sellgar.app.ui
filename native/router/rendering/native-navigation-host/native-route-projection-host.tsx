import React from 'react';

import { ScreenRenderer } from '../../../screen/rendering/screen-renderer';
import type { NativeRouteProjectionRuntime } from './native-route-projection-runtime.tsx';

interface NativeRouteProjectionHostProps {
  readonly runtime: NativeRouteProjectionRuntime;
}

export const NativeRouteProjectionHost: React.FC<NativeRouteProjectionHostProps> = React.memo(({ runtime }) => {
  return <ScreenRenderer onPresentationComplete={runtime.completePresentation} runtime={runtime.root} />;
});
