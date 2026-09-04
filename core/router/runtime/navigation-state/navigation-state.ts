import type { RouteMatchOptions, RouteToken } from '../../declaration/route-token';
import type { RouteDeclaration } from '../../declaration/route';
import { getRouteDefinition } from '../../declaration/route';
import type { RouterDeclaration } from '../../declaration/router';

export interface NavigationRouteEntry {
  readonly params: Readonly<Record<string, unknown>>;
  readonly route: RouteDeclaration;
  readonly token: RouteToken | undefined;
}

export interface NavigationRouterState {
  readonly child: NavigationRouterState | null;
  readonly owner: RouteDeclaration | null;
  readonly path: readonly NavigationRouteEntry[];
  readonly query: Readonly<Record<string, unknown>>;
  readonly router: RouterDeclaration;
}

export type NavigationRevalidation =
  | { readonly kind: 'branch' }
  | { readonly kind: 'restore' }
  | { readonly kind: 'router'; readonly router: RouterDeclaration }
  | null;

export interface NavigationInitiator {
  readonly kind: 'route';
  readonly runtimeId: string;
}

export interface NavigationNotFoundBoundary {
  readonly route: RouteDeclaration | null;
  readonly router: RouterDeclaration;
  readonly type: 'not-found';
}

export interface NavigationState {
  readonly boundary: NavigationNotFoundBoundary | null;
  readonly initiator: NavigationInitiator | null;
  readonly pendingNestedAddress: readonly string[] | null;
  readonly replace: boolean;
  readonly revalidation: NavigationRevalidation;
  readonly root: NavigationRouterState;
  readonly state: unknown;
}

export interface NavigationStateMatchOptions {
  readonly end?: boolean;
}

export interface NavigationControlState {
  readonly isActive: boolean;
  readonly isPending: boolean;
}

export const matchesNavigationRoute = <TToken extends RouteToken>(
  navigation: NavigationState | null | undefined,
  token: TToken,
  options: RouteMatchOptions<TToken> = {},
): boolean => {
  if (!navigation) {
    return false;
  }

  const entries = collectNavigationRouteEntries(navigation.root);
  const entry = entries.find((candidate) => candidate.token === token);

  if (!entry) {
    return false;
  }

  if (options.params && !areNavigationParamsEqual(entry.params, options.params)) {
    return false;
  }

  if (options.end === false) {
    return true;
  }

  const entryIndex = entries.indexOf(entry);

  return entries
    .slice(entryIndex + 1)
    .every((candidate) => candidate.token === undefined && getRouteDefinition(candidate.route).address === undefined);
};

export const areNavigationParamsEqual = (
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && Object.is(left[key], right[key]))
  );
};

export const areNavigationQueriesEqual = (
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && areQueryValuesEqual(left[key], right[key]))
  );
};

export const areNavigationStatesEqual = (left: NavigationState, right: NavigationState): boolean => {
  return areNavigationRouterStatesEqual(left.root, right.root);
};

const areNavigationRouterStatesEqual = (left: NavigationRouterState, right: NavigationRouterState): boolean => {
  if (
    left.router !== right.router ||
    left.owner !== right.owner ||
    left.path.length !== right.path.length ||
    !areNavigationQueriesEqual(left.query, right.query)
  ) {
    return false;
  }

  if (
    !left.path.every((entry, index) => {
      const candidate = right.path[index];

      return candidate?.route === entry.route && areNavigationParamsEqual(candidate.params, entry.params);
    })
  ) {
    return false;
  }

  if (left.child === null || right.child === null) {
    return left.child === right.child;
  }

  return areNavigationRouterStatesEqual(left.child, right.child);
};

const areQueryValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => areQueryValuesEqual(value, right[index]));
  }

  if (isQueryRecord(left) && isQueryRecord(right)) {
    return areNavigationQueriesEqual(left, right);
  }

  return false;
};

const isQueryRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
};

export const matchesNavigationState = (
  navigation: NavigationState | null | undefined,
  target: NavigationState,
  options: NavigationStateMatchOptions = {},
): boolean => {
  if (!navigation) {
    return false;
  }

  return matchesNavigationRouterState(navigation.root, target.root, options.end !== false);
};

export const resolveNavigationControlState = (
  navigation: NavigationState | null | undefined,
  pending: NavigationState | null | undefined,
  target: NavigationState,
  options: NavigationStateMatchOptions = {},
): NavigationControlState => {
  return Object.freeze({
    isActive: matchesNavigationState(navigation, target, options),
    isPending: matchesNavigationTarget(pending, target),
  });
};

export const resolveNavigationRouteState = <TToken extends RouteToken>(
  navigation: NavigationState | null | undefined,
  pending: NavigationState | null | undefined,
  token: TToken,
  options: RouteMatchOptions<TToken> = {},
): NavigationControlState => {
  return Object.freeze({
    isActive: matchesNavigationRoute(navigation, token, options),
    isPending: matchesNavigationRoute(pending, token, { ...options, end: true }),
  });
};

const matchesNavigationTarget = (navigation: NavigationState | null | undefined, target: NavigationState): boolean => {
  if (!navigation) {
    return false;
  }

  return (
    areNavigationInitiatorsEqual(navigation.initiator, target.initiator) &&
    matchesNavigationRouterTarget(navigation.root, target.root)
  );
};

const areNavigationInitiatorsEqual = (left: NavigationInitiator | null, right: NavigationInitiator | null): boolean => {
  if (left === null || right === null) {
    return left === right;
  }

  return left.kind === right.kind && left.runtimeId === right.runtimeId;
};

const matchesNavigationRouterState = (
  navigation: NavigationRouterState,
  target: NavigationRouterState,
  end: boolean,
): boolean => {
  if (
    navigation.router !== target.router ||
    navigation.owner !== target.owner ||
    target.path.length > navigation.path.length
  ) {
    return false;
  }

  const matchesTarget = target.path.every((entry, index) => {
    const candidate = navigation.path[index];

    return candidate?.route === entry.route && areNavigationParamsEqual(candidate.params, entry.params);
  });

  if (!matchesTarget) {
    return false;
  }

  if (
    end &&
    !navigation.path
      .slice(target.path.length)
      .every((entry) => entry.token === undefined && getRouteDefinition(entry.route).address === undefined)
  ) {
    return false;
  }

  if (target.child === null) {
    return true;
  }

  if (navigation.child === null) {
    return false;
  }

  return matchesNavigationRouterState(navigation.child, target.child, end);
};

const matchesNavigationRouterTarget = (navigation: NavigationRouterState, target: NavigationRouterState): boolean => {
  if (
    navigation.router !== target.router ||
    navigation.owner !== target.owner ||
    !areNavigationQueriesEqual(navigation.query, target.query) ||
    target.path.length > navigation.path.length
  ) {
    return false;
  }

  const matchesTarget = target.path.every((entry, index) => {
    const candidate = navigation.path[index];

    return candidate?.route === entry.route && areNavigationParamsEqual(candidate.params, entry.params);
  });

  if (
    !matchesTarget ||
    !navigation.path
      .slice(target.path.length)
      .every((entry) => entry.token === undefined && getRouteDefinition(entry.route).address === undefined)
  ) {
    return false;
  }

  if (target.child === null || navigation.child === null) {
    return target.child === navigation.child;
  }

  return matchesNavigationRouterTarget(navigation.child, target.child);
};

const collectNavigationRouteEntries = (router: NavigationRouterState): readonly NavigationRouteEntry[] => {
  const entries = [...router.path];

  if (router.child) {
    entries.push(...collectNavigationRouteEntries(router.child));
  }

  return entries;
};
