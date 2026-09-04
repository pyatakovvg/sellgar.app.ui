import React from 'react';

import type { NavigationRequestFactory } from '../../../core/router/service/navigation-request';
import { useNavigationControl } from '../hook/use-navigation-control';

export interface TabItemState {
  readonly isActive: boolean;
  readonly isPending: boolean;
  readonly tab: {
    readonly accessibilityRole: 'tab';
    readonly accessibilityState: {
      readonly busy: boolean;
      readonly selected: boolean;
    };
    readonly onPress: () => void;
  };
}

export interface TabItemProps {
  readonly children: (state: TabItemState) => React.ReactNode;
  readonly end?: boolean;
  readonly navigation: NavigationRequestFactory;
}

export const TabItem: React.FC<TabItemProps> = ({ end = false, ...props }) => {
  const control = useNavigationControl(props.navigation, end);
  const isPending = control.isPending || (!control.isActive && control.isRoutePending);
  const tab = React.useMemo(
    () => ({
      accessibilityRole: 'tab' as const,
      accessibilityState: {
        busy: isPending,
        selected: control.isActive,
      },
      onPress: () => void control.execute(),
    }),
    [control.execute, control.isActive, isPending],
  );

  return props.children({
    isActive: control.isActive,
    isPending,
    tab,
  });
};
