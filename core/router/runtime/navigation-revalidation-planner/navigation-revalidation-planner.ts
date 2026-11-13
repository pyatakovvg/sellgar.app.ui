import type { RouteDeclaration } from '../../declaration/route';
import type { NavigationOperation } from '../navigation-operation';
import type { RouterDeclaration } from '../../declaration/router';
import { areNavigationQueriesEqual, type NavigationRouterState, type NavigationState } from '../navigation-state';

export interface NavigationRevalidationTarget<TTarget> {
  readonly localChanged: boolean;
  readonly router: RouterDeclaration;
  readonly target: TTarget;
}

export interface NavigationRevalidationInput<TTarget> {
  readonly navigation: NavigationState;
  readonly previousNavigation: NavigationState | undefined;
  readonly targets: readonly NavigationRevalidationTarget<TTarget>[];
}

export const planNavigationRevalidation = <TTarget>({
  navigation,
  previousNavigation,
  targets,
}: NavigationRevalidationInput<TTarget>): readonly TTarget[] => {
  const selection = navigation.revalidation;

  if (!selection) return [];

  const changed = previousNavigation ? collectChangedQueryRouters(previousNavigation.root, navigation.root) : [];
  const candidates = targets.some((entry) => entry.localChanged)
    ? targets.filter((entry) => changed.includes(entry.router))
    : targets;

  switch (selection.kind) {
    case 'branch':
      return candidates.map((entry) => entry.target);
    case 'router':
      return candidates.filter((entry) => entry.router === selection.router).map((entry) => entry.target);
    case 'restore': {
      const selected = changed.length > 0 ? candidates.filter((entry) => changed.includes(entry.router)) : candidates;

      return selected.map((entry) => entry.target);
    }
  }
};

const collectChangedQueryRouters = (
  previous: NavigationRouterState,
  current: NavigationRouterState,
): readonly RouterDeclaration[] => {
  const routers: RouterDeclaration[] = [];
  let left: NavigationRouterState | null = previous;
  let right: NavigationRouterState | null = current;

  while (right && left?.router === right.router) {
    if (!areNavigationQueriesEqual(left.query, right.query)) routers.push(right.router);
    left = left.child;
    right = right.child;
  }

  return routers;
};

export const planNavigationCollectionRestart = (
  navigation: NavigationState,
  operation?: NavigationOperation,
): { readonly router: RouterDeclaration; readonly route: RouteDeclaration } | null => {
  if (!operation || !navigation.revalidation || navigation.boundary) return null;

  let origin = operation;
  while (origin.parent) origin = origin.parent;

  if (origin.trigger !== 'target' && origin.trigger !== 'root' && origin.trigger !== 'bridge-request') {
    return null;
  }

  let destination = navigation.root;
  while (destination.child) destination = destination.child;

  const entry = destination.path.at(-1);
  return entry ? { router: destination.router, route: entry.route } : null;
};
