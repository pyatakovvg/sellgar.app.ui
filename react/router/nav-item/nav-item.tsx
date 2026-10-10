import React from 'react';

import type { NavigationRequestFactory } from '../../../core/router/service/navigation-request';
import { useNavigationControl } from '../hook/use-navigation-control';

export interface NavItemState {
  readonly execute: () => Promise<void>;
  readonly isActive: boolean;
  readonly isPending: boolean;
}

export interface NavItemProps {
  readonly children: (state: NavItemState) => React.ReactNode;
  readonly end?: boolean;
  readonly navigation: NavigationRequestFactory;
  readonly viewTransition?: boolean;

  readonly [prop: string]: unknown;
}

export const NavItem: React.FC<NavItemProps> = ({
  children,
  end = true,
  navigation,
  viewTransition = false,
  ...childProps
}) => {
  const control = useNavigationControl(navigation, end, viewTransition);

  const node = children({
    execute: control.execute,
    isActive: control.isActive,
    isPending: control.isPending,
  });

  if (React.isValidElement<Record<string, unknown>>(node)) {
    return React.cloneElement(node, childProps);
  }

  return <>{node}</>;
};
