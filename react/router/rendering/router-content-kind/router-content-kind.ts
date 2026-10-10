import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';
import {
  resolveRouteContentKind,
  type RouteContentRange,
} from '../../../../shared/router/rendering/route-content-kind';
import type { LayoutContentKind } from '../../../../shared/layout/declaration/layout-content-kind';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { getRoutePresentationDefinition } from '../../declaration/route';
import { getRouterPresentationDefinition } from '../../declaration/router';

export const getRouteContentKind = (
  routes: ReturnType<RouterRuntime<ModuleMetadata>['getBranchSnapshot']>['routes'],
  range?: RouteContentRange,
): LayoutContentKind =>
  resolveRouteContentKind(routes, (route) => getRoutePresentationDefinition(route).layouts, range);

export const getRouterContentKind = (runtime: RouterRuntime<ModuleMetadata>): LayoutContentKind => {
  if (getRouterPresentationDefinition(runtime.router).layouts.length > 0) return 'layout';
  const branch = runtime.getBranchSnapshot();
  return getRouteContentKind(branch.routes, { pendingAfterRouteCount: branch.pendingLocalChange?.commonRouteCount });
};
