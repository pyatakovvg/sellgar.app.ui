import { getRouteDefinition, type RouteDeclaration, type RouteDefault } from '../../declaration/route';
import {
  type FirstAvailableRouteDefault,
  getRouterDefinition,
  isFirstAvailableRouteDefault,
  type RouterDeclaration,
} from '../../declaration/router';
import type { NavigationRouteEntry, NavigationRouterState, NavigationState } from '../navigation-state';
import { getRoutePath, getRouterGraph, type RouteGraphNode, validateRouteParams } from '../router-graph';

export interface ResolvedRouteEntry {
  readonly node: RouteGraphNode;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface ResolvedRouterTarget {
  readonly child: ResolvedRouterTarget | null;
  readonly owner: RouteDeclaration | null;
  readonly query: Readonly<Record<string, unknown>>;
  readonly routes: readonly ResolvedRouteEntry[];
  readonly router: RouterDeclaration;
}

export interface ResolvedNavigationCandidate {
  readonly navigation: NavigationState;
  readonly probeCanMatch: boolean;
  readonly target: ResolvedRouterTarget;
}

interface ResolvedRouterState {
  readonly child: ResolvedRouterState | null;
  readonly owner: RouteDeclaration | null;
  readonly path: readonly ResolvedRouteEntry[];
  readonly query: Readonly<Record<string, unknown>>;
  readonly router: RouterDeclaration;
}

interface RoutePathExpansion {
  readonly path: readonly ResolvedRouteEntry[];
  readonly probeCanMatch: boolean;
  readonly replace: boolean;
}

interface RouterStateExpansion {
  readonly probeCanMatch: boolean;
  readonly replace: boolean;
  readonly state: ResolvedRouterState;
}

interface ResolverContext {
  readonly currentParams: ReadonlyMap<RouteDeclaration, Readonly<Record<string, unknown>>>;
  readonly nodesByRoute: ReadonlyMap<RouteDeclaration, RouteGraphNode>;
  readonly rootRouter: RouterDeclaration;
}

export const resolveNavigationCandidates = (
  rootRouter: RouterDeclaration,
  navigation: NavigationState,
  current: NavigationState | undefined,
): readonly ResolvedNavigationCandidate[] => {
  const graph = getRouterGraph(rootRouter);
  const context: ResolverContext = {
    currentParams: collectNavigationParams(current?.root),
    nodesByRoute: new Map(graph.nodes.map((node) => [node.route, node])),
    rootRouter,
  };
  const root = validateRouterState(navigation.root, rootRouter, null, context);

  return Object.freeze(
    expandRouterState(root, context, false, false).map((expansion) => {
      const resolvedNavigation = freezeNavigation({
        ...navigation,
        replace: navigation.replace || expansion.replace,
        root: toNavigationRouterState(expansion.state),
      });

      return Object.freeze({
        navigation: resolvedNavigation,
        probeCanMatch: expansion.probeCanMatch,
        target: toRouterTarget(expansion.state),
      });
    }),
  );
};

const validateRouterState = (
  state: NavigationRouterState,
  expectedRouter: RouterDeclaration,
  expectedOwner: RouteGraphNode | null,
  context: ResolverContext,
): ResolvedRouterState => {
  if (state.router !== expectedRouter) {
    throw new Error('Navigation Router scope не соответствует route graph.');
  }

  if (state.owner !== (expectedOwner?.route ?? null)) {
    throw new Error('Navigation Router scope содержит неверную owner Route.');
  }

  if (state.path.length === 0) {
    if (expectedOwner !== null || state.child !== null) {
      throw new Error('Пустой Navigation Router path допустим только для root resolution.');
    }

    return Object.freeze({
      child: null,
      owner: null,
      path: Object.freeze([]),
      query: state.query,
      router: state.router,
    });
  }

  const path = state.path.map((entry, index) => {
    const node = context.nodesByRoute.get(entry.route);

    if (!node || node.router !== state.router) {
      throw new Error('Navigation Router path содержит Route другого Router scope.');
    }

    const expectedParent =
      index === 0 ? (expectedOwner ?? undefined) : context.nodesByRoute.get(state.path[index - 1]!.route);

    if (node.parent !== expectedParent) {
      throw new Error('Navigation Router path должен быть непрерывной локальной Route ancestry.');
    }

    const definition = getRouteDefinition(node.route);

    if (entry.token !== definition.token) {
      throw new Error('Navigation Router path содержит token, не принадлежащий Route declaration.');
    }

    validateRouteParams(node.route, entry.params);

    return Object.freeze({
      node,
      params: Object.freeze({ ...entry.params }),
    });
  });

  let child: ResolvedRouterState | null = null;

  if (state.child) {
    const owner = path.find((entry) => entry.node.route === state.child!.owner);

    if (!owner || !getRouteDefinition(owner.node.route).routing.includes(state.child.router)) {
      throw new Error('Navigation child Router недоступен из активной Route branch.');
    }

    child = validateRouterState(state.child, state.child.router, owner.node, context);
  }

  return Object.freeze({
    child,
    owner: expectedOwner?.route ?? null,
    path: Object.freeze(path),
    query: state.query,
    router: state.router,
  });
};

const expandRouterState = (
  state: ResolvedRouterState,
  context: ResolverContext,
  probeCanMatch: boolean,
  replace: boolean,
): readonly RouterStateExpansion[] => {
  if (state.path.length === 0) {
    return getRouterDefinition(state.router).routes.flatMap((route) => {
      const node = context.nodesByRoute.get(route);

      if (!node || node.parent !== undefined || node.router !== state.router) {
        throw new Error('Root Router содержит Route с неверной graph ancestry.');
      }

      const params = context.currentParams.get(route) ?? EMPTY_PARAMS;

      try {
        validateRouteParams(route, params);
      } catch {
        return [];
      }

      const path = Object.freeze([
        Object.freeze({
          node,
          params: Object.freeze({ ...params }),
        }),
      ]);

      return expandRoutePath(path, context, true, replace).map((local) => {
        return Object.freeze({
          probeCanMatch: local.probeCanMatch,
          replace: local.replace,
          state: Object.freeze({ ...state, path: local.path }),
        });
      });
    });
  }

  return expandRoutePath(state.path, context, probeCanMatch, replace).flatMap((local) => {
    if (!state.child) {
      return [
        Object.freeze({
          probeCanMatch: local.probeCanMatch,
          replace: local.replace,
          state: Object.freeze({ ...state, path: local.path }),
        }),
      ];
    }

    return expandRouterState(state.child, context, local.probeCanMatch, local.replace).map((child) => {
      return Object.freeze({
        probeCanMatch: child.probeCanMatch,
        replace: child.replace,
        state: Object.freeze({ ...state, child: child.state, path: local.path }),
      });
    });
  });
};

const expandRoutePath = (
  path: readonly ResolvedRouteEntry[],
  context: ResolverContext,
  probeCanMatch: boolean,
  replace: boolean,
): readonly RoutePathExpansion[] => {
  const terminal = path[path.length - 1]!;
  const definition = getRouteDefinition(terminal.node.route);

  if (definition.load !== undefined || definition.routes.length === 0) {
    return [Object.freeze({ path, probeCanMatch, replace })];
  }

  const indexRoute = definition.routes.find((route) => {
    const child = getRouteDefinition(route);

    return child.address === undefined && child.load !== undefined;
  });

  if (indexRoute) {
    return expandRoutePath(appendDirectChild(path, indexRoute, context), context, probeCanMatch, replace);
  }

  if (definition.defaultTo && !isFirstAvailableRouteDefaultValue(definition.defaultTo)) {
    const defaultPath = getRoutePath(context.rootRouter, definition.defaultTo);
    const terminalIndex = defaultPath.findIndex((node) => node === terminal.node);

    if (terminalIndex < 0) {
      throw new Error('Route.defaultTo не принадлежит текущей Route branch.');
    }

    const expanded = appendNodes(path, defaultPath.slice(terminalIndex + 1), context);

    return expandRoutePath(expanded, context, probeCanMatch, true);
  }

  if (definition.defaultTo && isFirstAvailableRouteDefaultValue(definition.defaultTo)) {
    return definition.routes.flatMap((route) => {
      return expandRoutePath(appendDirectChild(path, route, context), context, true, true);
    });
  }

  if (definition.token === undefined && definition.address === undefined) {
    return definition.routes.flatMap((route) => {
      return expandRoutePath(appendDirectChild(path, route, context), context, true, replace);
    });
  }

  throw new Error('Target Route с дочерними routes должна разрешаться через index Route или defaultTo.');
};

const appendDirectChild = (
  path: readonly ResolvedRouteEntry[],
  route: RouteDeclaration,
  context: ResolverContext,
): readonly ResolvedRouteEntry[] => {
  const parent = path[path.length - 1]!.node;
  const child = context.nodesByRoute.get(route);

  if (!child || child.parent !== parent || child.router !== parent.router) {
    throw new Error('Route child не принадлежит текущей локальной Route branch.');
  }

  return appendNodes(path, [child], context);
};

const appendNodes = (
  path: readonly ResolvedRouteEntry[],
  nodes: readonly RouteGraphNode[],
  context: ResolverContext,
): readonly ResolvedRouteEntry[] => {
  const entries = [...path];

  for (const node of nodes) {
    const params = context.currentParams.get(node.route) ?? EMPTY_PARAMS;

    validateRouteParams(node.route, params);
    entries.push(
      Object.freeze({
        node,
        params: Object.freeze({ ...params }),
      }),
    );
  }

  return Object.freeze(entries);
};

const toNavigationRouterState = (state: ResolvedRouterState): NavigationRouterState => {
  return Object.freeze({
    child: state.child ? toNavigationRouterState(state.child) : null,
    owner: state.owner,
    path: Object.freeze(state.path.map(toNavigationEntry)),
    query: state.query,
    router: state.router,
  });
};

const toRouterTarget = (state: ResolvedRouterState): ResolvedRouterTarget => {
  return Object.freeze({
    child: state.child ? toRouterTarget(state.child) : null,
    owner: state.owner,
    query: state.query,
    routes: state.path,
    router: state.router,
  });
};

const toNavigationEntry = (entry: ResolvedRouteEntry): NavigationRouteEntry => {
  const definition = getRouteDefinition(entry.node.route);

  return Object.freeze({
    params: entry.params,
    route: entry.node.route,
    token: definition.token,
  });
};

const freezeNavigation = (navigation: NavigationState): NavigationState => {
  return Object.freeze({ ...navigation, root: freezeRouterState(navigation.root) });
};

const freezeRouterState = (state: NavigationRouterState): NavigationRouterState =>
  Object.freeze({
    ...state,
    child: state.child ? freezeRouterState(state.child) : null,
    query: Object.freeze({ ...state.query }),
  });

const collectNavigationParams = (
  root: NavigationRouterState | undefined,
): ReadonlyMap<RouteDeclaration, Readonly<Record<string, unknown>>> => {
  const params = new Map<RouteDeclaration, Readonly<Record<string, unknown>>>();
  let state = root;

  while (state) {
    for (const entry of state.path) {
      params.set(entry.route, entry.params);
    }

    state = state.child ?? undefined;
  }

  return params;
};

const isFirstAvailableRouteDefaultValue = (value: RouteDefault): value is FirstAvailableRouteDefault => {
  return typeof value === 'object' && isFirstAvailableRouteDefault(value);
};

const EMPTY_PARAMS = Object.freeze({});
