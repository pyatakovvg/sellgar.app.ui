import React from 'react';
import { findNodeHandle } from 'react-native';

import { useScreenActive } from '../../screen/runtime/screen-activity-context';
import { useKeyboardScrollOwner } from '../runtime/keyboard-scroll-context';

export const useScreenAutoFocus = <Target extends React.Component & { focus: () => void }>(
  target: React.RefObject<Target | null>,
  enabled = true,
): void => {
  const active = useScreenActive();
  const scrollOwner = useKeyboardScrollOwner();

  React.useEffect(() => {
    if (!active || !enabled) return;

    const input = target.current;
    const nativeTarget = input ? findNodeHandle(input) : null;

    input?.focus();

    if (nativeTarget !== null) return scrollOwner?.revealAutoFocus(nativeTarget);
  }, [active, enabled, scrollOwner, target]);
};
