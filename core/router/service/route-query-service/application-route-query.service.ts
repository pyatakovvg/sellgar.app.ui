import type { RouteToken } from '../../declaration/route-token';
import type { RouterDeclaration } from '../../declaration/router';
import type { QueryConstructor, QueryConstructors, QueryInput, QueryValues } from '../../declaration/query';
import type { NavigationRouterState, NavigationState } from '../../runtime/navigation-state';
import { readQueries } from './query-converter.ts';
import {
  RouteQueryServiceInterface,
  type RouteQuery,
  type RouteQueryMutationOptions,
  type RouteQueryServiceListener,
} from './route-query-service.interface.ts';

export class ApplicationRouteQueryService extends RouteQueryServiceInterface {
  private readonly listeners = new Set<RouteQueryServiceListener>();
  private navigation: NavigationState | null = null;

  current(): RouteQuery {
    return this.navigation?.root.query ?? EMPTY_QUERY;
  }

  route(token: RouteToken): RouteQuery | null {
    return this.navigation ? findTokenQuery(this.navigation.root, token) : null;
  }

  getForRouter(router: RouterDeclaration): RouteQuery | null {
    return this.navigation ? findRouterQuery(this.navigation.root, router) : null;
  }

  get<const TTargets extends QueryConstructors>(...targets: TTargets): QueryValues<TTargets> {
    return readQueries(targets, this.current());
  }

  set<TQuery extends object>(
    _target: QueryConstructor<TQuery>,
    _value: QueryInput<TQuery>,
    _options?: RouteQueryMutationOptions,
  ): Promise<void> {
    return Promise.reject(new Error('Изменение query доступно только внутри Router scope.'));
  }

  clear(_target: QueryConstructor, _options?: RouteQueryMutationOptions): Promise<void> {
    return Promise.reject(new Error('Изменение query доступно только внутри Router scope.'));
  }

  subscribe(listener: RouteQueryServiceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  sync(navigation: NavigationState): void {
    this.navigation = navigation;
    this.listeners.forEach((listener) => listener());
  }
}

const findRouterQuery = (state: NavigationRouterState, router: RouterDeclaration): RouteQuery | null => {
  if (state.router === router) return state.query;
  return state.child ? findRouterQuery(state.child, router) : null;
};

const findTokenQuery = (state: NavigationRouterState, token: RouteToken): RouteQuery | null => {
  if (state.path.some((entry) => entry.token === token)) return state.query;
  return state.child ? findTokenQuery(state.child, token) : null;
};

const EMPTY_QUERY = Object.freeze({});
