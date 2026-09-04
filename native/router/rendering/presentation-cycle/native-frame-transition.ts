import type { NavigationRouterState, NavigationState } from '../../../../core/router/runtime/navigation-state';

export interface NativeFrameTransition {
  readonly depth: number;
  readonly operation: 'dismiss' | 'present' | 'replace';
  readonly revision: number;
}

export const resolveNativeFrameTransition = (
  current: NavigationState | undefined,
  target: NavigationState | null,
  revision: number | null,
): NativeFrameTransition | null => {
  if (!target || revision === null) return null;

  let currentRouter: NavigationRouterState | null = current?.root ?? null;
  let targetRouter: NavigationRouterState | null = target.root;
  let depth = 0;

  while (currentRouter || targetRouter) {
    const currentChild: NavigationRouterState | null = currentRouter?.child ?? null;
    const targetChild: NavigationRouterState | null = targetRouter?.child ?? null;

    if (!currentChild && !targetChild) return null;

    if (!currentChild) {
      return Object.freeze({ depth, operation: 'present', revision });
    }

    if (!targetChild) {
      return Object.freeze({ depth, operation: 'dismiss', revision });
    }

    if (currentChild.router !== targetChild.router || currentChild.owner !== targetChild.owner) {
      return Object.freeze({ depth, operation: 'replace', revision });
    }

    currentRouter = currentChild;
    targetRouter = targetChild;
    depth += 1;
  }

  return null;
};
