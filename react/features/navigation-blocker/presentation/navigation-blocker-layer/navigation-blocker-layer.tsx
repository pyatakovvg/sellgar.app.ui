import React from 'react';

import { NavigationBlockerRuntimeInterface } from '../../../../../core/features/navigation-blocker/runtime/navigation-blocker-runtime';
import { useDependency } from '../../../../runtime/scope/runtime-scope-context';
import type { NavigationBlockerPresentation } from '../../declaration/navigation-blocker-presentation';
import { NavigationBlockerPresentationRegistry } from '../navigation-blocker-presentation-registry';

interface IProps {
  readonly presentation: NavigationBlockerPresentation;
}

export const NavigationBlockerLayer: React.FC<IProps> = (props) => {
  const registry = useDependency(NavigationBlockerPresentationRegistry);
  const runtime = useDependency(NavigationBlockerRuntimeInterface);
  const request = React.useSyncExternalStore(
    React.useCallback((listener) => runtime.subscribe(listener), [runtime]),
    React.useCallback(() => runtime.getSnapshot(), [runtime]),
    () => null,
  );

  if (request === null) {
    return null;
  }

  const View = (registry.resolve(request.registrationIdentities) ?? props.presentation).resolve();

  return <View leave={() => runtime.leave()} stay={() => runtime.stay()} />;
};
