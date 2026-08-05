import { useHref, useNavigation } from 'react-router-dom';

import type { RouteMatchOptions } from '../../../router/utils/path-match';
import { matchPathname } from '../../../router/utils/path-match';

import { useLocation } from '../use-location';

export interface RoutePendingOptions extends RouteMatchOptions {
  readonly to?: string;
}

export const useRoutePending = (options: RoutePendingOptions = {}): boolean => {
  const { end = true, to } = options;
  const location = useLocation();
  const navigation = useNavigation();
  const target = to ?? `${location.pathname}${location.search}${location.hash}`;
  const href = useHref(target);
  const pendingTargetPathname = getTargetPathname(href);
  const pendingPathname = navigation.location?.pathname;

  return Boolean(navigation.location) && matchPathname(pendingPathname ?? '/', pendingTargetPathname, { end });
};

const getTargetPathname = (to: string): string => {
  return to.split(/[?#]/)[0] ?? to;
};
