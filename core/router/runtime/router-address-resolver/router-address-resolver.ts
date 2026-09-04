import { getRouteDefinition, type RouteDeclaration } from '../../declaration/route';
import { getRouterDefinition, type RouterDeclaration } from '../../declaration/router';
import type { RouterBridgeLocationInterface } from '../../bridge/router-bridge';
import type {
  NavigationNotFoundBoundary,
  NavigationRouteEntry,
  NavigationRouterState,
  NavigationState,
} from '../navigation-state';

interface AddressPathMatch {
  readonly consumed: number;
  readonly path: readonly NavigationRouteEntry[];
  readonly staticSegments: number;
}

interface NestedAddressMatch {
  readonly boundary: NavigationNotFoundBoundary | null;
  readonly consumed: number;
  readonly state: NavigationRouterState;
}

export interface ResolvedRouterBridgeNestedAddress {
  readonly boundary: NavigationNotFoundBoundary | null;
  readonly root: NavigationRouterState;
}

export const resolveRouterBridgeLocation = (
  router: RouterDeclaration,
  location: RouterBridgeLocationInterface,
): NavigationState => {
  if (location.address.length === 0) {
    return createNavigation(location, createRouterState(router, null, EMPTY_PATH, location.query, null), null);
  }

  const matches = matchRouterPaths(router, location.address);
  const exact = matches.find((match) => match.consumed === location.address.length);
  const rootMatch = exact ?? matches[0];
  const rootPath = rootMatch?.path ?? EMPTY_PATH;
  let boundary: NavigationNotFoundBoundary | null = null;

  if (!exact) {
    boundary = createNotFoundBoundary(router, rootPath.at(-1)?.route ?? null);
  }

  return createNavigation(location, createRouterState(router, null, rootPath, location.query, null), boundary);
};

export const resolveRouterBridgeNestedAddress = (
  root: NavigationRouterState,
  address: readonly string[],
): ResolvedRouterBridgeNestedAddress => {
  const nested = matchNestedAddress(root.path, address);

  if (!nested) {
    return Object.freeze({ boundary: null, root });
  }

  return Object.freeze({
    boundary: nested.boundary,
    root: createRouterState(root.router, root.owner, root.path, root.query, nested.state),
  });
};

const createNavigation = (
  location: RouterBridgeLocationInterface,
  root: NavigationRouterState,
  boundary: NavigationNotFoundBoundary | null,
): NavigationState => {
  const nested =
    boundary === null && location.nested ? resolveRouterBridgeNestedAddress(root, location.nested.address) : null;
  const resolvedRoot = nested?.root ?? root;

  return Object.freeze({
    boundary: nested?.boundary ?? boundary,
    initiator: null,
    pendingNestedAddress: null,
    replace: location.address.length === 0,
    revalidation: location.revalidate === false ? null : Object.freeze({ kind: 'restore' }),
    root: location.nested
      ? updateDeepestQuery(resolvedRoot, Object.freeze({ ...location.nested.query }))
      : resolvedRoot,
    state: location.state,
  });
};

const matchNestedAddress = (
  ownerPath: readonly NavigationRouteEntry[],
  address: readonly string[],
): NestedAddressMatch | null => {
  for (const owner of [...ownerPath].reverse()) {
    const routers = getRouteDefinition(owner.route).routing;

    for (const router of routers) {
      const matches = matchRouterPaths(router, address).filter((match) => match.consumed > 0);
      let partial: NestedAddressMatch | null = null;

      for (const match of matches) {
        let child: NavigationRouterState | null = null;
        let boundary: NavigationNotFoundBoundary | null = null;
        let consumed = match.consumed;

        if (consumed < address.length) {
          const nested = matchNestedAddress(match.path, address.slice(consumed));

          if (nested) {
            child = nested.state;
            boundary = nested.boundary;
            consumed += nested.consumed;
          } else {
            boundary = createNotFoundBoundary(router, match.path.at(-1)?.route ?? null);
          }
        }

        const candidate = Object.freeze({
          boundary,
          consumed,
          state: createRouterState(router, owner.route, match.path, EMPTY_QUERY, child),
        });

        if (consumed === address.length) {
          return candidate;
        }

        partial ??= candidate;
      }

      if (partial) {
        return partial;
      }
    }
  }

  return null;
};

const matchRouterPaths = (router: RouterDeclaration, address: readonly string[]): readonly AddressPathMatch[] => {
  const matches = matchRoutes(getRouterDefinition(router).routes, address, 0, EMPTY_PATH, 0);

  return Object.freeze(
    matches.sort((left, right) => {
      if (left.consumed !== right.consumed) {
        return right.consumed - left.consumed;
      }

      if (left.staticSegments !== right.staticSegments) {
        return right.staticSegments - left.staticSegments;
      }

      return right.path.length - left.path.length;
    }),
  );
};

const matchRoutes = (
  routes: readonly RouteDeclaration[],
  address: readonly string[],
  offset: number,
  parentPath: readonly NavigationRouteEntry[],
  inheritedStaticSegments: number,
): AddressPathMatch[] => {
  const matches: AddressPathMatch[] = [];

  for (const route of routes) {
    const definition = getRouteDefinition(route);
    const addressMatch = matchRouteAddress(route, address, offset);

    if (!addressMatch) {
      continue;
    }

    const path = Object.freeze([
      ...parentPath,
      Object.freeze({
        params: Object.freeze(addressMatch.params),
        route,
        token: definition.token,
      }),
    ]);
    const consumed = offset + addressMatch.consumed;
    const staticSegments = inheritedStaticSegments + addressMatch.staticSegments;

    matches.push(Object.freeze({ consumed, path, staticSegments }));
    matches.push(...matchRoutes(definition.routes, address, consumed, path, staticSegments));
  }

  return matches;
};

const matchRouteAddress = (
  route: RouteDeclaration,
  address: readonly string[],
  offset: number,
): { readonly consumed: number; readonly params: Record<string, string>; readonly staticSegments: number } | null => {
  const segments = getRouteDefinition(route).address?.segments ?? EMPTY_ADDRESS;

  if (offset + segments.length > address.length) {
    return null;
  }

  const params = Object.create(null) as Record<string, string>;
  let staticSegments = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const expected = segments[index]!;
    const actual = address[offset + index]!;

    if (typeof expected === 'string') {
      if (expected !== actual) {
        return null;
      }

      staticSegments += 1;
      continue;
    }

    params[expected.name] = actual;
  }

  return Object.freeze({ consumed: segments.length, params, staticSegments });
};

const createRouterState = (
  router: RouterDeclaration,
  owner: RouteDeclaration | null,
  path: readonly NavigationRouteEntry[],
  query: Readonly<Record<string, unknown>>,
  child: NavigationRouterState | null,
): NavigationRouterState => {
  return Object.freeze({ child, owner, path: Object.freeze([...path]), query, router });
};

const updateDeepestQuery = (
  state: NavigationRouterState,
  query: Readonly<Record<string, unknown>>,
): NavigationRouterState => {
  if (!state.child) return Object.freeze({ ...state, query });
  return Object.freeze({ ...state, child: updateDeepestQuery(state.child, query) });
};

const createNotFoundBoundary = (
  router: RouterDeclaration,
  route: RouteDeclaration | null,
): NavigationNotFoundBoundary => Object.freeze({ route, router, type: 'not-found' });

const EMPTY_ADDRESS = Object.freeze([]) as readonly string[];
const EMPTY_PATH = Object.freeze([]) as readonly NavigationRouteEntry[];
const EMPTY_QUERY = Object.freeze({});
