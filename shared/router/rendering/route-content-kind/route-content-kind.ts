import { getRouteDefinition, type RouteDeclaration } from '../../../../core/router/declaration/route';
import type { LayoutContentKind } from '../../../layout/declaration/layout-content-kind';

export interface RouteContentRange {
  readonly startIndex?: number;
  readonly endIndex?: number;
  readonly pendingAfterRouteCount?: number | null;
  readonly outletKind?: LayoutContentKind;
}

/** Resolves declared owners in the selected route range, stopping before a pending replacement. */
export const resolveRouteContentKind = (
  routes: readonly { readonly route: RouteDeclaration }[],
  getLayouts: (route: RouteDeclaration) => readonly unknown[],
  range: RouteContentRange = {},
): LayoutContentKind => {
  const start = range.startIndex ?? 0;
  const end = range.endIndex ?? routes.length;
  const pending = range.pendingAfterRouteCount;

  for (let index = start; index < end; index += 1) {
    if (index === pending) return null;
    const runtime = routes[index];
    if (!runtime) return range.outletKind ?? null;
    if (getLayouts(runtime.route).length > 0) return 'layout';
  }

  if (end === pending) return null;
  if (range.outletKind !== undefined) return range.outletKind;
  const terminal = start < end ? routes[end - 1] : undefined;
  return terminal && getRouteDefinition(terminal.route).load ? 'module' : null;
};
