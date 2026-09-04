import React from 'react';

import type { NavigationRequestFactory } from '../../../core/router/service/navigation-request';
import { useNavigationControl } from '../hook/use-navigation-control';

interface IProps {
  readonly children: (state: {
    readonly execute: () => Promise<void>;
    readonly isActive: boolean;
    readonly isPending: boolean;
  }) => React.ReactNode;
  readonly end?: boolean;
  readonly navigation: NavigationRequestFactory;
}

export const NavItem: React.FC<IProps> = ({ end = false, ...props }) => {
  const control = useNavigationControl(props.navigation, end);

  return props.children({
    execute: control.execute,
    isActive: control.isActive,
    isPending: control.isPending,
  });
};
