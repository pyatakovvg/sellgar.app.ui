import React from 'react';
import { useLocation, useNavigation } from 'react-router';

import type { ApplicationComponents } from '../../../application/config/application-configurator';

export interface RoutePendingBoundaryProps {
  readonly basePath?: string;
  readonly children: React.ReactNode;
  readonly fallback: ApplicationComponents['fallback'];
  readonly pathname: string;
}

export const RoutePendingBoundary: React.FC<RoutePendingBoundaryProps> = ({
  basePath,
  children,
  fallback,
  pathname,
}) => {
  const location = useLocation();
  const navigation = useNavigation();
  const nextLocation = navigation.location;
  const currentPathname = normalizePathname(location.pathname, basePath);
  const nextPathname = nextLocation ? normalizePathname(nextLocation.pathname, basePath) : undefined;
  const boundaryPathname = normalizePathname(pathname);
  const currentSegment = getBoundaryChildSegment(boundaryPathname, currentPathname);
  const nextSegment = nextPathname ? getBoundaryChildSegment(boundaryPathname, nextPathname) : undefined;
  const isRouteNavigation =
    navigation.state === 'loading' &&
    nextPathname !== undefined &&
    nextPathname !== currentPathname &&
    currentSegment !== nextSegment;

  if (isRouteNavigation) {
    return <>{fallback ?? null}</>;
  }

  return <>{children}</>;
};

const normalizePathname = (pathname: string, basePath?: string): string => {
  if (!basePath || basePath === '/') {
    return pathname;
  }

  if (pathname === basePath) {
    return '/';
  }

  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length);
  }

  return pathname;
};

const getBoundaryChildSegment = (boundaryPathname: string, pathname: string): string | null => {
  if (boundaryPathname === '/') {
    return getFirstPathSegment(pathname);
  }

  if (pathname === boundaryPathname) {
    return '';
  }

  if (!pathname.startsWith(`${boundaryPathname}/`)) {
    return null;
  }

  return getFirstPathSegment(pathname.slice(boundaryPathname.length));
};

const getFirstPathSegment = (pathname: string): string => {
  return pathname.replace(/^\//, '').split('/')[0] ?? '';
};
