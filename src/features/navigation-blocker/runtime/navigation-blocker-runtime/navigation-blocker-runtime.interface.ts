import type { NavigationBlockerCondition } from '../../contract/navigation-blocker-service';
import type { NavigationBlockerPresentation } from '../../declaration/navigation-blocker-presentation';
import type { NavigationBlockerBoundary, NavigationBlockerTransition } from './navigation-blocker-boundary.ts';

export interface NavigationBlockerRequest {
  readonly inProcess: boolean;
  readonly presentation?: NavigationBlockerPresentation;
}

export interface NavigationBlockerTransitionControl {
  proceed(): void;
  reset(): void;
}

export interface NavigationBlockerRuntimeRegistration {
  dispose(): void;
}

export type NavigationBlockerRuntimeListener = () => void;

export abstract class NavigationBlockerRuntimeInterface {
  abstract allow<TResult>(
    boundary: NavigationBlockerBoundary,
    operation: () => TResult | Promise<TResult>,
  ): Promise<TResult>;

  abstract attach(control: NavigationBlockerTransitionControl): void;

  abstract complete(): void;

  abstract getSnapshot(): NavigationBlockerRequest | null;

  abstract leave(): void;

  abstract register(
    boundary: NavigationBlockerBoundary,
    condition: NavigationBlockerCondition,
    presentation?: NavigationBlockerPresentation,
  ): NavigationBlockerRuntimeRegistration;

  abstract shouldBlock(transition: NavigationBlockerTransition): boolean;

  abstract shouldBlockUnload(): boolean;

  abstract stay(): void;

  abstract subscribe(listener: NavigationBlockerRuntimeListener): () => void;
}
