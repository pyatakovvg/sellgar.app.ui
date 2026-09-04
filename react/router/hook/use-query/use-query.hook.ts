import React from 'react';

import type { RouteToken } from '../../../../core/router/declaration/route-token';
import { RouteQueryServiceInterface, type RouteQuery } from '../../../../core/router/service/route-query-service';
import { useDependency } from '../../../runtime/scope/runtime-scope-context';

export function useQuery(): RouteQuery;
export function useQuery(token: RouteToken): RouteQuery | null;
export function useQuery(token?: RouteToken): RouteQuery | null {
  const service = useDependency(RouteQueryServiceInterface);
  const subscribe = React.useCallback((listener: () => void) => service.subscribe(listener), [service]);
  const getSnapshot = React.useCallback(() => (token ? service.route(token) : service.current()), [service, token]);

  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
