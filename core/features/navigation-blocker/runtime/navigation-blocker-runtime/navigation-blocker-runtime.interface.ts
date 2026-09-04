import type {
  NavigationBlockerCondition,
  NavigationBlockerRegistration,
  NavigationBlockerRegistrationIdentity,
  NavigationBlockerRegistrationOptions,
} from '../../contract/navigation-blocker-service';
import type { NavigationBlockerBoundary } from './navigation-blocker-boundary.ts';

export interface NavigationBlockerDecisionSnapshot {
  readonly registrationIdentities: readonly NavigationBlockerRegistrationIdentity[];
}

export type NavigationBlockerRuntimeListener = () => void;

export abstract class NavigationBlockerRuntimeInterface {
  abstract allow<TResult>(
    boundary: NavigationBlockerBoundary,
    operation: () => TResult | Promise<TResult>,
  ): Promise<TResult>;

  abstract complete(): void;

  abstract confirm(leavingBoundaries: readonly NavigationBlockerBoundary[], signal: AbortSignal): Promise<boolean>;

  abstract getSnapshot(): NavigationBlockerDecisionSnapshot | null;

  abstract hasAcceptedDecision(): boolean;

  abstract leave(): void;

  abstract register(
    boundary: NavigationBlockerBoundary,
    condition: NavigationBlockerCondition,
    options?: NavigationBlockerRegistrationOptions,
  ): NavigationBlockerRegistration;

  abstract shouldBlockUnload(): boolean;

  abstract stay(): void;

  abstract subscribe(listener: NavigationBlockerRuntimeListener): () => void;
}
