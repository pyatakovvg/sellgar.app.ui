import React from 'react';

import { WidgetRuntimeRegistry } from '../../../../core/widget/runtime/widget-runtime-registry';
import { ScreenRenderer } from '../../../screen/rendering/screen-renderer';
import { ScreenPresentationCommitProvider } from '../../../screen/runtime/screen-presentation-context';
import type { ScreenSceneRuntime } from '../../../screen/runtime/screen-runtime';
import { useDependency } from '../../../runtime/scope/runtime-scope-context';
import type { NativeRouteProjectionRuntime } from './native-route-projection-runtime.tsx';

interface NativeRouteProjectionHostProps {
  readonly runtime: NativeRouteProjectionRuntime;
}

export const NativeRouteProjectionHost: React.FC<NativeRouteProjectionHostProps> = React.memo(({ runtime }) => {
  const widgets = useDependency(WidgetRuntimeRegistry);
  const onScenePresented = React.useCallback(
    (scene: ScreenSceneRuntime) => widgets.reconcilePresentation(scene),
    [widgets],
  );

  return (
    <ScreenPresentationCommitProvider value={onScenePresented}>
      <ScreenRenderer onPresentationComplete={runtime.completePresentation} runtime={runtime.root} />
    </ScreenPresentationCommitProvider>
  );
});
