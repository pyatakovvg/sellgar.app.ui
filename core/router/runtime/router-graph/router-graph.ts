import { getRouteAddressParamNames } from '../../declaration/address';
import { getRouteDefinition, type RouteDeclaration, type RouteDefault } from '../../declaration/route';
import {
  type FirstAvailableRouteDefault,
  getRouterDefinition,
  isFirstAvailableRouteDefault,
  type RouterDeclaration,
} from '../../declaration/router';
import type { RouteToken } from '../../declaration/route-token';

export interface RouteGraphNode {
  readonly parent: RouteGraphNode | undefined;
  readonly route: RouteDeclaration;
  readonly router: RouterDeclaration;
}

export interface RouterGraph {
  readonly nodes: readonly RouteGraphNode[];
  readonly tokens: ReadonlyMap<RouteToken, RouteGraphNode>;
}

const routerGraphs = new WeakMap<RouterDeclaration, RouterGraph>();

export const getRouterGraph = (router: RouterDeclaration): RouterGraph => {
  const existing = routerGraphs.get(router);

  if (existing) {
    return existing;
  }

  const graph = createRouterGraph(router);

  routerGraphs.set(router, graph);

  return graph;
};

export const getRoutePath = (router: RouterDeclaration, token: RouteToken): readonly RouteGraphNode[] => {
  const target = getRouterGraph(router).tokens.get(token);

  if (!target) {
    throw new Error(`Route token не зарегистрирован: ${token.name || '<anonymous>'}.`);
  }

  const path: RouteGraphNode[] = [];
  let node: RouteGraphNode | undefined = target;

  while (node) {
    path.unshift(node);
    node = node.parent;
  }

  return Object.freeze(path);
};

export const validateRouteParams = (route: RouteDeclaration, params: Readonly<Record<string, unknown>>): void => {
  const expected = getRouteAddressParamNames(getRouteDefinition(route).address);
  const actual = Object.keys(params);
  const missing = expected.filter((name) => !Object.hasOwn(params, name));
  const extra = actual.filter((name) => !expected.includes(name));

  if (missing.length || extra.length) {
    throw new Error(
      `Route params не соответствуют address: missing=[${missing.join(', ')}], extra=[${extra.join(', ')}].`,
    );
  }
};

const createRouterGraph = (router: RouterDeclaration): RouterGraph => {
  const nodes: RouteGraphNode[] = [];
  const tokens = new Map<RouteToken, RouteGraphNode>();
  const visitedRoutes = new Set<RouteDeclaration>();
  const visitedRouters = new Set<RouterDeclaration>();

  const visitRouter = (currentRouter: RouterDeclaration, parent: RouteGraphNode | undefined): void => {
    if (visitedRouters.has(currentRouter)) {
      throw new Error('Один Router instance нельзя использовать в нескольких местах route graph.');
    }

    visitedRouters.add(currentRouter);

    for (const route of getRouterDefinition(currentRouter).routes) {
      visitRoute(route, currentRouter, parent);
    }
  };

  const visitRoute = (
    route: RouteDeclaration,
    currentRouter: RouterDeclaration,
    parent: RouteGraphNode | undefined,
  ): void => {
    if (visitedRoutes.has(route)) {
      throw new Error('Один Route instance нельзя использовать в нескольких местах route graph.');
    }

    visitedRoutes.add(route);

    const definition = getRouteDefinition(route);
    const node = Object.freeze({ parent, route, router: currentRouter });

    nodes.push(node);

    if (definition.token) {
      if (tokens.has(definition.token)) {
        throw new Error(`Route token зарегистрирован повторно: ${definition.token.name || '<anonymous>'}.`);
      }

      tokens.set(definition.token, node);
    }

    for (const child of definition.routes) {
      visitRoute(child, currentRouter, node);
    }

    for (const childRouter of definition.routing) {
      visitRouter(childRouter, node);
    }
  };

  visitRouter(router, undefined);
  validateRouteDefaults(nodes, tokens);

  return Object.freeze({
    nodes: Object.freeze(nodes),
    tokens,
  });
};

const validateRouteDefaults = (
  nodes: readonly RouteGraphNode[],
  tokens: ReadonlyMap<RouteToken, RouteGraphNode>,
): void => {
  for (const node of nodes) {
    const defaultTo = getRouteDefinition(node.route).defaultTo;

    if (!defaultTo || isFirstAvailable(defaultTo)) {
      continue;
    }

    const target = tokens.get(defaultTo);

    if (!target || target.router !== node.router || !isStrictDescendant(target, node)) {
      throw new Error(
        `Route.defaultTo должен указывать на строгого потомка в том же Router scope: ${defaultTo.name || '<anonymous>'}.`,
      );
    }
  }
};

const isFirstAvailable = (value: RouteDefault): value is FirstAvailableRouteDefault => {
  return typeof value === 'object' && isFirstAvailableRouteDefault(value);
};

const isStrictDescendant = (target: RouteGraphNode, ancestor: RouteGraphNode): boolean => {
  let node = target.parent;

  while (node) {
    if (node === ancestor) {
      return true;
    }

    node = node.parent;
  }

  return false;
};
