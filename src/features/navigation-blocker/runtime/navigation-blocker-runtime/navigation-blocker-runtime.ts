import type { NavigationBlockerCondition } from '../../contract/navigation-blocker-service';
import type { NavigationBlockerPresentation } from '../../declaration/navigation-blocker-presentation';
import type {
  NavigationBlockerBoundary,
  NavigationBlockerLocation,
  NavigationBlockerTransition,
} from './navigation-blocker-boundary.ts';
import {
  NavigationBlockerRuntimeInterface,
  type NavigationBlockerRequest,
  type NavigationBlockerRuntimeListener,
  type NavigationBlockerRuntimeRegistration,
  type NavigationBlockerTransitionControl,
} from './navigation-blocker-runtime.interface.ts';

interface BlockerRegistration {
  readonly boundary: NavigationBlockerBoundary;
  readonly condition: NavigationBlockerCondition;
  readonly id: number;
  readonly presentation?: NavigationBlockerPresentation;
}

interface Allowance {
  consumed: boolean;
  readonly id: number;
}

const frameRouterIds = new WeakMap<object, number>();
let frameRouterRevision = 0;

export class NavigationBlockerRuntime implements NavigationBlockerRuntimeInterface {
  private readonly allowances = new Map<string, Allowance[]>();
  private readonly listeners = new Set<NavigationBlockerRuntimeListener>();
  private readonly registrations = new Map<number, BlockerRegistration>();

  private activeControl: NavigationBlockerTransitionControl | null = null;
  private pendingPresentation: NavigationBlockerPresentation | undefined;
  private request: NavigationBlockerRequest | null = null;
  private revision = 0;

  async allow<TResult>(
    boundary: NavigationBlockerBoundary,
    operation: () => TResult | Promise<TResult>,
  ): Promise<TResult> {
    const boundaryKey = getBoundaryKey(boundary);
    const allowance = this.createAllowance(boundaryKey);

    try {
      return await operation();
    } finally {
      this.removeAllowance(boundaryKey, allowance.id);
    }
  }

  attach(control: NavigationBlockerTransitionControl): void {
    if (this.request !== null) {
      return;
    }

    this.activeControl = control;
    this.request = {
      inProcess: false,
      presentation: this.pendingPresentation,
    };
    this.pendingPresentation = undefined;
    this.emit();
  }

  complete(): void {
    this.clearRequest();
  }

  getSnapshot(): NavigationBlockerRequest | null {
    return this.request;
  }

  leave(): void {
    if (this.activeControl === null || this.request === null || this.request.inProcess) {
      return;
    }

    this.request = {
      ...this.request,
      inProcess: true,
    };
    this.emit();
    this.activeControl.proceed();
  }

  register(
    boundary: NavigationBlockerBoundary,
    condition: NavigationBlockerCondition,
    presentation?: NavigationBlockerPresentation,
  ): NavigationBlockerRuntimeRegistration {
    const id = ++this.revision;

    this.registrations.set(id, {
      boundary,
      condition,
      id,
      presentation,
    });

    return {
      dispose: () => {
        this.registrations.delete(id);
      },
    };
  }

  shouldBlock(transition: NavigationBlockerTransition): boolean {
    const leavingBoundaries = new Map<string, NavigationBlockerBoundary>();

    for (const registration of this.registrations.values()) {
      if (isBoundaryLeaving(registration.boundary, transition)) {
        leavingBoundaries.set(getBoundaryKey(registration.boundary), registration.boundary);
      }
    }

    const allowedBoundaryKeys = new Set<string>();

    for (const boundaryKey of leavingBoundaries.keys()) {
      if (this.consumeAllowance(boundaryKey)) {
        allowedBoundaryKeys.add(boundaryKey);
      }
    }

    const blockingRegistrations = [...this.registrations.values()].filter((registration) => {
      const boundaryKey = getBoundaryKey(registration.boundary);

      return leavingBoundaries.has(boundaryKey) && !allowedBoundaryKeys.has(boundaryKey) && registration.condition();
    });

    if (blockingRegistrations.length === 0) {
      this.pendingPresentation = undefined;
      return false;
    }

    this.pendingPresentation = resolvePresentation(blockingRegistrations);
    return true;
  }

  shouldBlockUnload(): boolean {
    return [...this.registrations.values()].some((registration) => registration.condition());
  }

  stay(): void {
    if (this.activeControl === null || this.request === null || this.request.inProcess) {
      return;
    }

    const control = this.activeControl;

    this.clearRequest();
    control.reset();
  }

  subscribe(listener: NavigationBlockerRuntimeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private clearRequest(): void {
    if (this.activeControl === null && this.request === null && this.pendingPresentation === undefined) {
      return;
    }

    this.activeControl = null;
    this.pendingPresentation = undefined;
    this.request = null;
    this.emit();
  }

  private consumeAllowance(boundaryKey: string): boolean {
    const allowance = this.allowances.get(boundaryKey)?.find((entry) => !entry.consumed);

    if (!allowance) {
      return false;
    }

    allowance.consumed = true;
    return true;
  }

  private createAllowance(boundaryKey: string): Allowance {
    const allowance = {
      consumed: false,
      id: ++this.revision,
    };
    const allowances = this.allowances.get(boundaryKey) ?? [];

    allowances.push(allowance);
    this.allowances.set(boundaryKey, allowances);

    return allowance;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private removeAllowance(boundaryKey: string, allowanceId: number): void {
    const allowances = this.allowances.get(boundaryKey);

    if (!allowances) {
      return;
    }

    const nextAllowances = allowances.filter((allowance) => allowance.id !== allowanceId);

    if (nextAllowances.length === 0) {
      this.allowances.delete(boundaryKey);
      return;
    }

    this.allowances.set(boundaryKey, nextAllowances);
  }
}

const getBoundaryKey = (boundary: NavigationBlockerBoundary): string => {
  if (boundary.kind === 'route') {
    return `route:${boundary.routeId}`;
  }

  return `frame:${boundary.routeId}:${getFrameRouterId(boundary.router)}:${boundary.sourcePath}`;
};

const getFrameRouterId = (router: object): number => {
  const currentId = frameRouterIds.get(router);

  if (currentId !== undefined) {
    return currentId;
  }

  const id = ++frameRouterRevision;

  frameRouterIds.set(router, id);
  return id;
};

const isBoundaryLeaving = (boundary: NavigationBlockerBoundary, transition: NavigationBlockerTransition): boolean => {
  if (boundary.kind === 'frame') {
    return !isSameFrameBoundary(boundary, transition.next.frame);
  }

  const currentMatch = findRouteMatch(transition.current, boundary.routeId);
  const nextMatch = findRouteMatch(transition.next, boundary.routeId);

  return currentMatch !== null && (nextMatch === null || currentMatch.pathname !== nextMatch.pathname);
};

const findRouteMatch = (location: NavigationBlockerLocation, routeId: string) => {
  return location.routes.find((route) => route.id === routeId) ?? null;
};

const isSameFrameBoundary = (
  boundary: NavigationBlockerBoundary & { readonly kind: 'frame' },
  next: NavigationBlockerLocation['frame'],
): boolean => {
  return (
    next !== null &&
    next.routeId === boundary.routeId &&
    next.router === boundary.router &&
    next.sourcePath === boundary.sourcePath
  );
};

const resolvePresentation = (
  registrations: readonly BlockerRegistration[],
): NavigationBlockerPresentation | undefined => {
  return [...registrations]
    .sort((left, right) => {
      if (left.boundary.kind !== right.boundary.kind) {
        return left.boundary.kind === 'frame' ? -1 : 1;
      }

      return right.id - left.id;
    })
    .find((registration) => registration.presentation !== undefined)?.presentation;
};
