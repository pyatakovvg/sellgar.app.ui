import type { RouteToken } from '../../declaration/route-token';
import type { RouterDeclaration } from '../../declaration/router';
import type { QueryConstructor, QueryConstructors, QueryInput, QueryValues } from '../../declaration/query';
import { areNavigationQueriesEqual } from '../../runtime/navigation-state';
import type { NavigateServiceInterface } from '../navigate-service';
import { ApplicationRouteQueryService } from './application-route-query.service.ts';
import { createQueryClear, createQueryReplacement, readQueries } from './query-converter.ts';
import {
  RouteQueryServiceInterface,
  type RouteQuery,
  type RouteQueryMutationOptions,
  type RouteQueryServiceListener,
} from './route-query-service.interface.ts';

export class ScopedRouteQueryService extends RouteQueryServiceInterface {
  private readonly listeners = new Set<RouteQueryServiceListener>();
  private readonly unsubscribe: () => void;
  private pending: RouteQuery | null = null;

  constructor(
    private readonly source: ApplicationRouteQueryService,
    private readonly router: RouterDeclaration,
    private readonly navigate: NavigateServiceInterface | null,
  ) {
    super();
    this.unsubscribe = source.subscribe(() => {
      const committed = source.getForRouter(router);
      if (this.pending && committed && areNavigationQueriesEqual(this.pending, committed)) this.pending = null;
      this.emit();
    });
  }

  current(): RouteQuery {
    return this.pending ?? this.source.getForRouter(this.router) ?? EMPTY_QUERY;
  }

  route(token: RouteToken): RouteQuery | null {
    return this.source.route(token);
  }

  get<const TTargets extends QueryConstructors>(...targets: TTargets): QueryValues<TTargets> {
    return readQueries(targets, this.current());
  }

  async set<TQuery extends object>(
    target: QueryConstructor<TQuery>,
    value: QueryInput<TQuery>,
    options: RouteQueryMutationOptions = {},
  ): Promise<void> {
    await this.requireNavigate().query(createQueryReplacement(target, value), {
      ...options,
      merge: true,
    });
  }

  async clear(target: QueryConstructor, options: RouteQueryMutationOptions = {}): Promise<void> {
    await this.requireNavigate().query(createQueryClear(target), {
      ...options,
      merge: true,
    });
  }

  subscribe(listener: RouteQueryServiceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  stage(query: RouteQuery): void {
    this.pending = query;
    this.emit();
  }

  discardPending(): void {
    if (!this.pending) return;
    this.pending = null;
    this.emit();
  }

  dispose(): void {
    this.unsubscribe();
    this.listeners.clear();
    this.pending = null;
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  private requireNavigate(): NavigateServiceInterface {
    if (!this.navigate) {
      throw new Error('Изменение query требует NavigateService в Router scope.');
    }

    return this.navigate;
  }
}

const EMPTY_QUERY = Object.freeze({});
