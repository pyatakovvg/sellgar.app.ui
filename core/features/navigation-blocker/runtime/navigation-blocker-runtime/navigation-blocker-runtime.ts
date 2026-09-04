import type {
  NavigationBlockerCondition,
  NavigationBlockerDecisionHandler,
  NavigationBlockerRegistration,
  NavigationBlockerRegistrationIdentity,
  NavigationBlockerRegistrationOptions,
} from '../../contract/navigation-blocker-service';
import type { NavigationBlockerBoundary } from './navigation-blocker-boundary.ts';
import {
  NavigationBlockerRuntimeInterface,
  type NavigationBlockerDecisionSnapshot,
  type NavigationBlockerRuntimeListener,
} from './navigation-blocker-runtime.interface.ts';

interface BlockerRegistration {
  readonly boundary: NavigationBlockerBoundary;
  readonly condition: NavigationBlockerCondition;
  readonly identity: NavigationBlockerRegistrationIdentity;
  readonly onLeave?: NavigationBlockerDecisionHandler;
  readonly onStay?: NavigationBlockerDecisionHandler;
}

interface Allowance {
  consumed: boolean;
  readonly identity: number;
}

interface PendingDecision {
  readonly abort: () => void;
  readonly resolve: (leave: boolean) => void;
}

export class NavigationBlockerRuntime extends NavigationBlockerRuntimeInterface {
  private readonly allowances = new Map<NavigationBlockerBoundary, Allowance[]>();
  private readonly listeners = new Set<NavigationBlockerRuntimeListener>();
  private readonly registrations = new Map<NavigationBlockerRegistrationIdentity, BlockerRegistration>();

  private acceptedDecision = false;
  private pendingDecision: PendingDecision | null = null;
  private removeDecisionAbortListener: (() => void) | null = null;
  private revision = 0;
  private snapshot: NavigationBlockerDecisionSnapshot | null = null;

  async allow<TResult>(
    boundary: NavigationBlockerBoundary,
    operation: () => TResult | Promise<TResult>,
  ): Promise<TResult> {
    const allowance = this.createAllowance(boundary);

    try {
      return await operation();
    } finally {
      this.removeAllowance(boundary, allowance.identity);
    }
  }

  complete(): void {
    this.clearDecision();
  }

  confirm(leavingBoundaries: readonly NavigationBlockerBoundary[], signal: AbortSignal): Promise<boolean> {
    if (this.acceptedDecision) {
      return Promise.resolve(false);
    }

    if (this.pendingDecision) {
      throw new Error('Решение о переходе уже ожидается.');
    }

    const identities = this.collectBlockingRegistrationIdentities(leavingBoundaries);

    if (identities.length === 0) {
      return Promise.resolve(true);
    }

    if (signal.aborted) {
      return Promise.resolve(false);
    }

    return new Promise<boolean>((resolve) => {
      const handleAbort = (): void => {
        this.clearDecision();
        resolve(false);
      };

      signal.addEventListener('abort', handleAbort, { once: true });
      this.removeDecisionAbortListener = () => signal.removeEventListener('abort', handleAbort);
      this.pendingDecision = {
        abort: () => this.removeDecisionAbortListener?.(),
        resolve,
      };
      this.snapshot = Object.freeze({
        registrationIdentities: Object.freeze(identities),
      });
      this.emit();
    });
  }

  getSnapshot(): NavigationBlockerDecisionSnapshot | null {
    return this.snapshot;
  }

  hasAcceptedDecision(): boolean {
    return this.acceptedDecision;
  }

  leave(): void {
    if (!this.pendingDecision || !this.snapshot) {
      return;
    }

    const decision = this.pendingDecision;
    const identities = this.snapshot.registrationIdentities;

    this.pendingDecision = null;
    this.acceptedDecision = true;
    this.snapshot = null;
    this.emit();
    const handlers = this.resolveDecisionHandlers(identities, 'onLeave');

    try {
      invokeDecisionHandlers(handlers);
    } finally {
      decision.resolve(true);
    }
  }

  register(
    boundary: NavigationBlockerBoundary,
    condition: NavigationBlockerCondition,
    options?: NavigationBlockerRegistrationOptions,
  ): NavigationBlockerRegistration {
    const identity = ++this.revision as NavigationBlockerRegistrationIdentity;

    this.registrations.set(identity, {
      boundary,
      condition,
      identity,
      onLeave: options?.onLeave,
      onStay: options?.onStay,
    });

    return Object.freeze({
      identity,
      dispose: () => {
        this.registrations.delete(identity);
      },
    });
  }

  shouldBlockUnload(): boolean {
    return [...this.registrations.values()].some((registration) => registration.condition());
  }

  stay(): void {
    if (!this.pendingDecision || !this.snapshot) {
      return;
    }

    const decision = this.pendingDecision;
    const handlers = this.resolveDecisionHandlers(this.snapshot.registrationIdentities, 'onStay');

    this.clearDecision();

    try {
      invokeDecisionHandlers(handlers);
    } finally {
      decision.resolve(false);
    }
  }

  subscribe(listener: NavigationBlockerRuntimeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private clearDecision(): void {
    if (!this.pendingDecision && !this.snapshot && !this.acceptedDecision) {
      return;
    }

    this.pendingDecision?.abort();
    this.pendingDecision = null;
    this.removeDecisionAbortListener?.();
    this.removeDecisionAbortListener = null;
    this.acceptedDecision = false;
    this.snapshot = null;
    this.emit();
  }

  private collectBlockingRegistrationIdentities(
    leavingBoundaries: readonly NavigationBlockerBoundary[],
  ): NavigationBlockerRegistrationIdentity[] {
    const identities: NavigationBlockerRegistrationIdentity[] = [];

    for (const boundary of leavingBoundaries) {
      if (this.consumeAllowance(boundary)) {
        continue;
      }

      const registrations = [...this.registrations.values()]
        .filter((registration) => registration.boundary === boundary)
        .sort((left, right) => right.identity - left.identity);

      for (const registration of registrations) {
        if (registration.condition()) {
          identities.push(registration.identity);
        }
      }
    }

    return identities;
  }

  private consumeAllowance(boundary: NavigationBlockerBoundary): boolean {
    const allowance = this.allowances.get(boundary)?.find((entry) => !entry.consumed);

    if (!allowance) {
      return false;
    }

    allowance.consumed = true;
    return true;
  }

  private createAllowance(boundary: NavigationBlockerBoundary): Allowance {
    const allowance = { consumed: false, identity: ++this.revision };
    const allowances = this.allowances.get(boundary) ?? [];

    allowances.push(allowance);
    this.allowances.set(boundary, allowances);
    return allowance;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private removeAllowance(boundary: NavigationBlockerBoundary, identity: number): void {
    const allowances = this.allowances.get(boundary);

    if (!allowances) {
      return;
    }

    const remaining = allowances.filter((allowance) => allowance.identity !== identity);

    if (remaining.length === 0) {
      this.allowances.delete(boundary);
      return;
    }

    this.allowances.set(boundary, remaining);
  }

  private resolveDecisionHandlers(
    identities: readonly NavigationBlockerRegistrationIdentity[],
    key: 'onLeave' | 'onStay',
  ): NavigationBlockerDecisionHandler[] {
    return identities.flatMap((identity) => {
      const handler = this.registrations.get(identity)?.[key];

      return handler ? [handler] : [];
    });
  }
}

const invokeDecisionHandlers = (handlers: readonly NavigationBlockerDecisionHandler[]): void => {
  const errors: unknown[] = [];

  for (const handler of handlers) {
    try {
      handler();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length === 1) {
    throw errors[0];
  }

  if (errors.length > 1) {
    throw new AggregateError(errors, 'Navigation blocker decision handlers failed.');
  }
};
