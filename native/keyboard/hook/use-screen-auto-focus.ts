import React from 'react';

import { useScreenActive } from '../../screen/runtime/screen-activity-context';

export const useScreenAutoFocus = <Target extends { focus: () => void }>(
  target: React.RefObject<Target | null>,
  enabled = true,
): void => {
  const active = useScreenActive();

  React.useEffect(() => {
    if (!active || !enabled) return;

    target.current?.focus();
  }, [active, enabled, target]);
};
