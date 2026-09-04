import type { RouteParams, RouteToken } from '../../declaration/route-token';
import type { RouteDeclaration } from '../../declaration/route';
import { getRouteDefinition } from '../../declaration/route';
import type { RouterDeclaration } from '../../declaration/router';
import { getRoutePath, getRouterGraph, type RouteGraphNode, validateRouteParams } from '../../runtime/router-graph';
import type {
  NavigationInitiator,
  NavigationRouteEntry,
  NavigationRouterState,
  NavigationState,
} from '../../runtime/navigation-state';
import { areNavigationParamsEqual, areNavigationQueriesEqual } from '../../runtime/navigation-state';
import type { NavigationRequest, NavigationRequestBinding } from '../navigation-request';
import { createNavigationRequestBinding, createTerminalNavigationRequest } from '../navigation-request';
import {
  type NavigateArguments,
  NavigateServiceInterface,
  type NavigateTerminalOptions,
  type NavigateQueryOptions,
  type NavigateThrough,
  type ThroughArguments,
} from './navigate-service.interface.ts';

export type NavigationExecutor = (navigation: NavigationState) => void | Promise<void>;

export interface CoreNavigateOptions {
  readonly back: () => void | Promise<void>;
  readonly close: NavigationExecutor;
  readonly current?: () => NavigationState | undefined;
  readonly execute: NavigationExecutor;
  readonly router: RouterDeclaration;
}

export const createCoreNavigate = (options: CoreNavigateOptions): NavigateServiceInterface => {
  getRouterGraph(options.router);

  return new CoreNavigate(options, [], null, null);
};

export const createScopedNavigate = (
  navigate: NavigateServiceInterface,
  router: RouterDeclaration,
): NavigateServiceInterface => {
  if (!(navigate instanceof CoreNavigate)) {
    throw new Error('Scoped navigation можно создать только из core NavigateService.');
  }

  return new CoreNavigate(navigate.options, [], router, navigate.initiator);
};

export const createRouteScopedNavigate = (
  navigate: NavigateServiceInterface,
  runtimeId: string,
): NavigateServiceInterface => {
  if (!(navigate instanceof CoreNavigate)) {
    throw new Error('Route-scoped navigation можно создать только из core NavigateService.');
  }

  return new CoreNavigate(navigate.options, [], navigate.scopeRouter, Object.freeze({ kind: 'route', runtimeId }));
};

export const resolveNavigateRequest = (
  navigate: NavigateServiceInterface,
  request: NavigationRequest,
): NavigationState => {
  return getCoreNavigate(navigate).resolve(request);
};

export const executeNavigateRequest = async (
  navigate: NavigateServiceInterface,
  request: NavigationRequest,
): Promise<void> => {
  await getCoreNavigate(navigate).execute(request);
};

class CoreNavigate extends NavigateServiceInterface {
  constructor(
    readonly options: CoreNavigateOptions,
    private readonly bindings: readonly NavigationRequestBinding[],
    readonly scopeRouter: RouterDeclaration | null,
    readonly initiator: NavigationInitiator | null,
  ) {
    super();
  }

  async back(): Promise<void> {
    await this.options.back();
  }

  async close(): Promise<void> {
    if (this.scopeRouter === null) {
      throw new Error('navigate.close() доступен только внутри вложенного Router scope.');
    }

    const current = this.options.current?.();

    if (!current) {
      throw new Error('navigate.close() требует committed navigation state.');
    }

    await this.options.close(resolveCloseNavigation(current, this.scopeRouter, this.initiator));
  }

  async root(options: NavigateTerminalOptions = {}): Promise<void> {
    const navigation = resolveCoreRootNavigation(
      this.options.router,
      options,
      this.options.current?.(),
      this.initiator,
    );

    await this.options.execute(navigation);
  }

  through<TToken extends RouteToken, TParams extends RouteParams<TToken> = RouteParams<TToken>>(
    token: TToken,
    ...args: ThroughArguments<TToken, TParams>
  ): NavigateThrough {
    return new CoreNavigate(
      this.options,
      [...this.bindings, createNavigationRequestBinding(token, args[0])],
      this.scopeRouter,
      this.initiator,
    );
  }

  async to<TToken extends RouteToken, TParams extends RouteParams<TToken> = RouteParams<TToken>>(
    token: TToken,
    ...args: NavigateArguments<TToken, TParams>
  ): Promise<void> {
    await this.execute(createTerminalNavigationRequest(this.bindings, token, args[0]));
  }

  resolve(request: NavigationRequest): NavigationState {
    return resolveNavigation(
      this.options.router,
      request.bindings,
      request.token,
      request.options,
      this.options.current?.(),
      this.initiator,
    );
  }

  async execute(request: NavigationRequest): Promise<void> {
    await this.options.execute(this.resolve(request));
  }

  async query(query: Readonly<Record<string, unknown>>, options: NavigateQueryOptions = {}): Promise<void> {
    const current = this.options.current?.();

    if (!current) {
      throw new Error('navigate.query() требует committed navigation state.');
    }

    const navigation = resolveQueryNavigation(
      current,
      this.scopeRouter ?? current.root.router,
      query,
      options,
      this.initiator,
    );

    if (navigation !== current) {
      await this.options.execute(navigation);
    }
  }
}

const resolveCloseNavigation = (
  current: NavigationState,
  scopeRouter: RouterDeclaration,
  initiator: NavigationInitiator | null,
): NavigationState => {
  const root = removeRouterScope(current.root, scopeRouter);

  if (root === null) {
    throw new Error('navigate.close() не может закрыть root Router.');
  }

  if (root === current.root) {
    throw new Error('navigate.close() вызывается вне активного Router scope.');
  }

  return Object.freeze({
    boundary: null,
    initiator,
    pendingNestedAddress: null,
    replace: false,
    revalidation: null,
    root,
    state: undefined,
  });
};

const removeRouterScope = (
  current: NavigationRouterState,
  scopeRouter: RouterDeclaration,
): NavigationRouterState | null => {
  if (current.router === scopeRouter) {
    return null;
  }

  if (current.child === null) {
    return current;
  }

  const child = removeRouterScope(current.child, scopeRouter);

  if (child === current.child) {
    return current;
  }

  return Object.freeze({
    ...current,
    child,
  });
};

export const resolveCoreNavigation = (
  router: RouterDeclaration,
  targetToken: RouteToken,
  options: NavigateTerminalOptions & { readonly params?: Readonly<Record<string, unknown>> },
  current: NavigationState | undefined,
): NavigationState => {
  return resolveNavigation(router, [], targetToken, options, current, null);
};

export const resolveCoreRootNavigation = (
  router: RouterDeclaration,
  options: NavigateTerminalOptions = {},
  _current: NavigationState | undefined,
  initiator: NavigationInitiator | null = null,
): NavigationState => {
  return Object.freeze({
    boundary: null,
    initiator,
    pendingNestedAddress: null,
    replace: options.replace ?? true,
    revalidation: options.revalidate === false ? null : Object.freeze({ kind: 'branch' }),
    root: Object.freeze({
      child: null,
      owner: null,
      path: Object.freeze([]),
      query: resolveQuery(EMPTY_QUERY, options.query ?? EMPTY_QUERY, false),
      router,
    }),
    state: options.state,
  });
};

const resolveNavigation = (
  router: RouterDeclaration,
  bindings: readonly NavigationRequestBinding[],
  targetToken: RouteToken,
  options: (NavigateTerminalOptions & { readonly params?: Readonly<Record<string, unknown>> }) | undefined,
  current: NavigationState | undefined,
  initiator: NavigationInitiator | null,
): NavigationState => {
  const path = getRoutePath(router, targetToken);
  const targetIndex = path.length - 1;
  const targetNode = path[targetIndex]!;
  const currentParams = collectCurrentParams(current?.root);
  const boundNodes = new Map<RouteGraphNode, Readonly<Record<string, unknown>>>();
  let previousIndex = -1;

  for (const binding of bindings) {
    const index = path.findIndex((node) => getRouteDefinition(node.route).token === binding.token);

    if (index < 0 || index >= targetIndex || index <= previousIndex) {
      throw new Error(
        `navigate.through() принимает только уникальных строгих предков target в порядке route graph: ${binding.token.name || '<anonymous>'}.`,
      );
    }

    validateRouteParams(path[index]!.route, binding.params);

    const node = path[index]!;
    const committedParams = currentParams.get(node.route);

    if (node.router !== targetNode.router && committedParams) {
      if (!areNavigationParamsEqual(committedParams, binding.params)) {
        throw new Error(
          `navigate.through() не может изменять params активного владельца nested Router: ${binding.token.name || '<anonymous>'}.`,
        );
      }

      previousIndex = index;
      continue;
    }

    boundNodes.set(node, binding.params);
    previousIndex = index;
  }

  const targetParams = options?.params ?? {};

  validateRouteParams(targetNode.route, targetParams);
  boundNodes.set(targetNode, targetParams);

  const root = createNavigationRouterState(
    path,
    0,
    boundNodes,
    currentParams,
    current?.root,
    targetNode.router,
    resolveQuery(EMPTY_QUERY, options?.query ?? EMPTY_QUERY, false),
  );

  return Object.freeze({
    boundary: null,
    initiator,
    pendingNestedAddress: null,
    replace: options?.replace ?? false,
    revalidation: options?.revalidate === false ? null : Object.freeze({ kind: 'branch' }),
    root,
    state: options?.state,
  });
};

const createNavigationRouterState = (
  targetPath: readonly RouteGraphNode[],
  start: number,
  boundNodes: ReadonlyMap<RouteGraphNode, Readonly<Record<string, unknown>>>,
  currentParams: ReadonlyMap<RouteDeclaration, Readonly<Record<string, unknown>>>,
  current: NavigationRouterState | undefined,
  targetRouter: RouterDeclaration,
  targetQuery: Readonly<Record<string, unknown>>,
): NavigationRouterState => {
  const router = targetPath[start]!.router;
  let end = start + 1;

  while (end < targetPath.length && targetPath[end]!.router === router) {
    end += 1;
  }

  const targetRoutes = targetPath.slice(start, end).map((node) => node.route);
  const canPreserveCurrentPath =
    end < targetPath.length &&
    current?.router === router &&
    targetRoutes.every((route, index) => current.path[index]?.route === route);
  const routes = canPreserveCurrentPath ? current.path.map((entry) => entry.route) : targetRoutes;
  const path = routes.map((route) => {
    const node = targetPath.find((candidate) => candidate.route === route);
    const params = (node ? boundNodes.get(node) : undefined) ?? currentParams.get(route) ?? EMPTY_PARAMS;

    validateRouteParams(route, params);

    return freezeNavigationRouteEntry(route, params);
  });
  const childOwner = end < targetPath.length ? targetPath[end]!.parent?.route : null;
  const currentChild =
    childOwner && current?.child?.owner === childOwner && current.child.router === targetPath[end]!.router
      ? current.child
      : undefined;
  const child =
    end < targetPath.length
      ? createNavigationRouterState(targetPath, end, boundNodes, currentParams, currentChild, targetRouter, targetQuery)
      : null;

  return Object.freeze({
    child,
    owner: start === 0 ? null : targetPath[start]!.parent!.route,
    path: Object.freeze(path),
    query: router === targetRouter ? targetQuery : (current?.query ?? EMPTY_QUERY),
    router,
  });
};

const collectCurrentParams = (
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

const freezeNavigationRouteEntry = (
  route: RouteDeclaration,
  params: Readonly<Record<string, unknown>>,
): NavigationRouteEntry => {
  return Object.freeze({
    params: Object.freeze({ ...params }),
    route,
    token: getRouteDefinition(route).token,
  });
};

const resolveQueryNavigation = (
  current: NavigationState,
  scopeRouter: RouterDeclaration,
  query: Readonly<Record<string, unknown>>,
  options: NavigateQueryOptions,
  initiator: NavigationInitiator | null,
): NavigationState => {
  const merge = options.merge ?? true;
  const currentRouter = findRouterState(current.root, scopeRouter);

  if (!currentRouter) {
    throw new Error('navigate.query() вызывается вне активного Router scope.');
  }

  const nextQuery = resolveQuery(currentRouter.query, query, merge);

  if (areNavigationQueriesEqual(currentRouter.query, nextQuery)) {
    return current;
  }

  return Object.freeze({
    boundary: current.boundary,
    initiator,
    pendingNestedAddress: current.pendingNestedAddress,
    replace: options.replace ?? false,
    revalidation: options.revalidate === false ? null : Object.freeze({ kind: 'router', router: scopeRouter }),
    root: updateRouterQuery(current.root, scopeRouter, nextQuery),
    state: options.state,
  });
};

const findRouterState = (state: NavigationRouterState, router: RouterDeclaration): NavigationRouterState | null => {
  if (state.router === router) return state;
  return state.child ? findRouterState(state.child, router) : null;
};

const updateRouterQuery = (
  state: NavigationRouterState,
  router: RouterDeclaration,
  query: Readonly<Record<string, unknown>>,
): NavigationRouterState => {
  if (state.router === router) return Object.freeze({ ...state, query });
  if (!state.child) return state;

  const child = updateRouterQuery(state.child, router, query);
  return child === state.child ? state : Object.freeze({ ...state, child });
};

const resolveQuery = (
  current: Readonly<Record<string, unknown>>,
  update: Readonly<Record<string, unknown>>,
  merge: boolean,
): Readonly<Record<string, unknown>> => {
  const query: Record<string, unknown> = merge ? { ...current } : {};

  for (const [key, value] of Object.entries(update)) {
    const normalized = normalizeQueryValue(value);

    if (normalized === REMOVED_QUERY_VALUE) {
      delete query[key];
    } else {
      query[key] = normalized;
    }
  }

  return Object.freeze(query);
};

const normalizeQueryValue = (value: unknown): unknown => {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim().length === 0)) {
    return REMOVED_QUERY_VALUE;
  }

  if (!Array.isArray(value)) {
    return value;
  }

  const values = value.filter(
    (entry) => entry !== null && entry !== undefined && !(typeof entry === 'string' && entry.trim().length === 0),
  );

  return values.length === 0 ? REMOVED_QUERY_VALUE : Object.freeze(values);
};

const EMPTY_PARAMS = Object.freeze({});
const EMPTY_QUERY = Object.freeze({});
const REMOVED_QUERY_VALUE = Symbol('removed-query-value');

const getCoreNavigate = (navigate: NavigateServiceInterface): CoreNavigate => {
  if (!(navigate instanceof CoreNavigate)) {
    throw new Error('Navigation request можно использовать только с core NavigateService.');
  }

  return navigate;
};
