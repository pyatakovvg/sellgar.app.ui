import type { RouteDeclaration } from '../../../../core/router/declaration/route';
import { areNavigationParamsEqual } from '../../../../core/router/runtime/navigation-state';
import type { NavigationRouteEntry, NavigationState } from '../../../../core/router/runtime/navigation-state';

export interface NativePendingRouteProjection {
  readonly changeDepth: number;
  readonly path: readonly NavigationRouteEntry[];
}

export const resolveNativePendingRouteProjection = (
  current: NavigationState | undefined,
  pending: NavigationState | null,
): NativePendingRouteProjection | null => {
  if (!pending) return null;

  const path = pending.root.path;
  const currentPath = current?.root.path ?? [];
  const changeDepth = resolveNativeRouteChangeDepth(currentPath, path);

  if (changeDepth === null) return null;

  return Object.freeze({
    changeDepth,
    path,
  });
};

export const resolveNativeRouteChangeDepth = (
  current: readonly NavigationRouteEntry[],
  target: readonly NavigationRouteEntry[],
): number | null => {
  const commonRouteCount = resolveCommonRouteCount(current, target);

  if (commonRouteCount === current.length && commonRouteCount === target.length) {
    return null;
  }

  return commonRouteCount;
};

export const resolveNativeRoutePresentationKey = (entry: NavigationRouteEntry, depth: number): string => {
  return `native-route:${depth}:${resolveRouteIdentity(entry.route)}:${serializeParams(entry.params)}`;
};

export const resolveNativeRouteIndexPresentationKey = (owner: NavigationRouteEntry, depth: number): string => {
  return `${resolveNativeRoutePresentationKey(owner, depth - 1)}:index`;
};

const resolveCommonRouteCount = (
  current: readonly NavigationRouteEntry[],
  pending: readonly NavigationRouteEntry[],
): number => {
  const length = Math.min(current.length, pending.length);

  for (let index = 0; index < length; index += 1) {
    const currentEntry = current[index]!;
    const pendingEntry = pending[index]!;

    if (
      currentEntry.route !== pendingEntry.route ||
      !areNavigationParamsEqual(currentEntry.params, pendingEntry.params)
    ) {
      return index;
    }
  }

  return length;
};

const resolveRouteIdentity = (route: RouteDeclaration): number => {
  const current = routeIdentities.get(route);

  if (current !== undefined) return current;

  const identity = ++routeIdentitySequence;

  routeIdentities.set(route, identity);
  return identity;
};

const serializeParams = (params: Readonly<Record<string, unknown>>): string => {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeParamValue(params[key])}`)
    .join('&');
};

const encodeParamValue = (value: unknown): string => {
  switch (typeof value) {
    case 'string':
      return `string:${encodeURIComponent(value)}`;
    case 'number':
      return `number:${String(value)}`;
    case 'bigint':
      return `bigint:${String(value)}`;
    case 'boolean':
      return `boolean:${String(value)}`;
    case 'undefined':
      return 'undefined';
    default:
      if (value === null) return 'null';
      throw new Error('Path param native screen должен быть сериализуемым примитивом.');
  }
};

const routeIdentities = new WeakMap<RouteDeclaration, number>();
let routeIdentitySequence = 0;
