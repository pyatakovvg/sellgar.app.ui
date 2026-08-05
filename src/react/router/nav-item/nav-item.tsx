import React from 'react';

import type { RouteMatchOptions } from '../../../router/utils/path-match';

import { useLocation } from '../use-location';
import { useRoutePending } from '../use-route-pending';

export interface NavItemState {
  readonly isActive: boolean;
  readonly isPending: boolean;
  readonly to: string;
}

export interface NavItemProps {
  readonly children: (state: NavItemState) => React.ReactNode;
  readonly end?: boolean;
  readonly to: string;

  readonly [prop: string]: unknown;
}

export const NavItem: React.FC<NavItemProps> = ({ children, end = true, to, ...childProps }) => {
  const location = useLocation();
  const options: RouteMatchOptions = { end };
  const targetPathname = getTargetPathname(to);
  const isPending = useRoutePending({ end, to });

  const node = children({
    isActive: location.matches(targetPathname, options),
    isPending,
    to,
  });

  if (React.isValidElement<Record<string, unknown>>(node)) {
    return React.cloneElement(node, childProps);
  }

  return <>{node}</>;
};

const getTargetPathname = (to: string): string => {
  return to.split(/[?#]/)[0] ?? to;
};
