import React from 'react';

import { useDependency } from '../../../../runtime/react';
import type { NavigationBlockerPresentation } from '../../declaration/navigation-blocker-presentation';
import { NavigationBlockerRuntimeInterface } from '../../runtime/navigation-blocker-runtime';

interface IProps {
  readonly presentation: NavigationBlockerPresentation;
}

export const NavigationBlockerLayer: React.FC<IProps> = (props) => {
  const runtime = useDependency(NavigationBlockerRuntimeInterface);
  const request = React.useSyncExternalStore(
    React.useCallback((listener) => runtime.subscribe(listener), [runtime]),
    React.useCallback(() => runtime.getSnapshot(), [runtime]),
    () => null,
  );

  if (request === null) {
    return null;
  }

  const View = (request.presentation ?? props.presentation).resolve();

  return <View inProcess={request.inProcess} leave={() => runtime.leave()} stay={() => runtime.stay()} />;
};
