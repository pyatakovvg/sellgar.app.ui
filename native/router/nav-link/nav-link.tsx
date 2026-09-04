import React from 'react';

import type { NavigationRequestFactory } from '../../../core/router/service/navigation-request';
import { useNavigationControl } from '../hook/use-navigation-control';

interface IProps {
  readonly children: (state: {
    readonly link: {
      readonly accessibilityRole: 'link';
      readonly onPress: () => void;
    };
    readonly isActive: boolean;
    readonly isPending: boolean;
  }) => React.ReactNode;
  readonly end?: boolean;
  readonly navigation: NavigationRequestFactory;
}

export const NavLink: React.FC<IProps> = ({ end = false, ...props }) => {
  const control = useNavigationControl(props.navigation, end);
  const link = {
    accessibilityRole: 'link' as const,
    onPress: () => void control.execute(),
  };

  return props.children({
    link,
    isActive: control.isActive,
    isPending: control.isPending,
  });
};
