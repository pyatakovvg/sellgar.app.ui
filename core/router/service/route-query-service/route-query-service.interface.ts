import type { RouteToken } from '../../declaration/route-token';
import type { QueryConstructor, QueryConstructors, QueryInput, QueryValues } from '../../declaration/query';
import type { NavigateQueryOptions } from '../navigate-service';

export type RouteQuery = Readonly<Record<string, unknown>>;
export type RouteQueryServiceListener = () => void;
export type RouteQueryMutationOptions = Omit<NavigateQueryOptions, 'merge'>;

export abstract class RouteQueryServiceInterface {
  abstract current(): RouteQuery;
  abstract route(token: RouteToken): RouteQuery | null;

  abstract get<const TTargets extends QueryConstructors>(...targets: TTargets): QueryValues<TTargets>;

  abstract set<TQuery extends object>(
    target: QueryConstructor<TQuery>,
    value: QueryInput<TQuery>,
    options?: RouteQueryMutationOptions,
  ): Promise<void>;

  abstract clear(target: QueryConstructor, options?: RouteQueryMutationOptions): Promise<void>;

  abstract subscribe(listener: RouteQueryServiceListener): () => void;
}
