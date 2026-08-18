import React from 'react';
import {
  matchRoutes,
  NavigationType,
  useBeforeUnload,
  useBlocker as useRouterBlocker,
  useLocation,
  type BlockerFunction,
  type Location,
  type RouteObject,
} from 'react-router';

import type { RouterRuntime } from '../../../../router/runtime/router-runtime';
import type {
  NavigationBlockerLocation,
  NavigationBlockerRuntimeInterface,
} from '../../runtime/navigation-blocker-runtime';
import { connectNavigationPrecommit } from './navigation-precommit.ts';

interface IProps {
  readonly basePath?: string;
  readonly routeObjects: RouteObject[];
  readonly routerRuntime: RouterRuntime;
  readonly runtime: NavigationBlockerRuntimeInterface;
}

export const NavigationBlockerBridge: React.FC<IProps> = (props) => {
  const currentLocation = useLocation();
  const currentLocationRef = React.useRef(currentLocation);
  const precommittedTraversalRef = React.useRef<string | null>(null);

  currentLocationRef.current = currentLocation;

  const clearPrecommittedTraversal = React.useCallback(() => {
    precommittedTraversalRef.current = null;
  }, []);
  const permitTraversal = React.useCallback(
    (destination: URL) => {
      precommittedTraversalRef.current = createLocationKey(destination, props.basePath);
    },
    [props.basePath],
  );
  const shouldBlock = React.useCallback<BlockerFunction>(
    ({ currentLocation: current, historyAction, nextLocation: next }) => {
      if (
        historyAction === NavigationType.Pop &&
        consumePrecommittedTraversal(precommittedTraversalRef, next, props.basePath)
      ) {
        return false;
      }

      return props.runtime.shouldBlock({
        current: resolveLocation(current, props.routeObjects, props.routerRuntime, props.basePath),
        next: resolveLocation(next, props.routeObjects, props.routerRuntime, props.basePath),
      });
    },
    [props.basePath, props.routeObjects, props.routerRuntime, props.runtime],
  );
  const blocker = useRouterBlocker(shouldBlock);

  React.useEffect(() => {
    return connectNavigationPrecommit({
      clearPrecommittedTraversal,
      permitTraversal,
      resolveTransition: (destination) => {
        return {
          current: resolveLocation(currentLocationRef.current, props.routeObjects, props.routerRuntime, props.basePath),
          next: resolveLocation(destination, props.routeObjects, props.routerRuntime, props.basePath),
        };
      },
      runtime: props.runtime,
    });
  }, [
    clearPrecommittedTraversal,
    permitTraversal,
    props.basePath,
    props.routeObjects,
    props.routerRuntime,
    props.runtime,
  ]);

  useBeforeUnload(
    React.useCallback(
      (event) => {
        if (!props.runtime.shouldBlockUnload()) {
          return;
        }

        event.preventDefault();
        event.returnValue = '';
      },
      [props.runtime],
    ),
  );

  React.useEffect(() => {
    if (blocker.state === 'blocked') {
      props.runtime.attach({
        proceed: blocker.proceed,
        reset: blocker.reset,
      });
      return;
    }

    if (blocker.state === 'unblocked') {
      props.runtime.complete();
    }
  }, [blocker, props.runtime]);

  return null;
};

const resolveLocation = (
  location: RoutableLocation,
  routeObjects: RouteObject[],
  routerRuntime: RouterRuntime,
  basePath?: string,
): NavigationBlockerLocation => {
  const pathname = normalizePathname(location.pathname, basePath);
  const matches = matchRoutes(routeObjects, pathname) ?? [];
  const routeIds = matches.flatMap((match) => {
    return typeof match.route.id === 'string' ? [match.route.id] : [];
  });
  const activeFrameRoute = routerRuntime.matchFrameRoute(routeIds, location.hash);

  return {
    frame: activeFrameRoute
      ? {
          kind: 'frame',
          routeId: activeFrameRoute.routeId,
          router: activeFrameRoute.match.router,
          sourcePath: activeFrameRoute.match.sourcePath,
        }
      : null,
    routes: matches.flatMap((match) => {
      return typeof match.route.id === 'string'
        ? [
            {
              id: match.route.id,
              pathname: match.pathname,
            },
          ]
        : [];
    }),
  };
};

interface RoutableLocation {
  readonly hash: string;
  readonly pathname: string;
  readonly search: string;
}

const consumePrecommittedTraversal = (
  traversalRef: React.MutableRefObject<string | null>,
  location: Location,
  basePath?: string,
): boolean => {
  const permittedLocation = traversalRef.current;

  if (permittedLocation === null) {
    return false;
  }

  traversalRef.current = null;
  return permittedLocation === createLocationKey(location, basePath);
};

const createLocationKey = (location: RoutableLocation, basePath?: string): string => {
  return `${normalizePathname(location.pathname, basePath)}${location.search}${location.hash}`;
};

const normalizePathname = (pathname: string, basePath?: string): string => {
  if (!basePath || basePath === '/') {
    return pathname;
  }

  if (pathname === basePath) {
    return '/';
  }

  return pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname;
};
