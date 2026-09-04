import React from 'react';

import type { NavigationRequestFactory } from '../../../core/router/service/navigation-request';
import { useNavigationControl } from '../hook/use-navigation-control';
import { useNavigationState } from '../runtime/navigation-state-context';

interface IProps {
  readonly children: (state: {
    readonly anchor: {
      readonly 'aria-current': 'page' | undefined;
      readonly href: string;
      readonly onClick: React.MouseEventHandler<HTMLAnchorElement>;
    };
    readonly isActive: boolean;
    readonly isPending: boolean;
  }) => React.ReactNode;
  readonly end?: boolean;
  readonly navigation: NavigationRequestFactory;
  readonly viewTransition?: boolean;
}

export const NavLink: React.FC<IProps> = ({ end = false, viewTransition = false, ...props }) => {
  const navigation = useNavigationState();
  const control = useNavigationControl(props.navigation, end, viewTransition);
  const href = navigation.createHref(control.target);
  const onClick: React.MouseEventHandler<HTMLAnchorElement> = (event) => {
    if (!canNavigate(event)) {
      return;
    }

    event.preventDefault();
    void control.execute();
  };
  const anchor = {
    'aria-current': control.isActive ? ('page' as const) : undefined,
    href,
    onClick,
  };

  return props.children({
    anchor,
    isActive: control.isActive,
    isPending: control.isPending,
  });
};

const canNavigate = (event: React.MouseEvent<HTMLAnchorElement>): boolean => {
  const anchor = event.currentTarget;

  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !anchor.hasAttribute('download') &&
    (anchor.target === '' || anchor.target === '_self')
  );
};
