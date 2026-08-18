import type { NavigationBlockerPresentation } from '../../declaration/navigation-blocker-presentation';

export type NavigationBlockerCondition = () => boolean;

export interface NavigationBlockerRegistration {
  dispose(): void;
}

export interface NavigationBlockerRegistrationOptions {
  readonly presentation?: NavigationBlockerPresentation;
}

export abstract class NavigationBlockerServiceInterface {
  abstract allow<TResult>(operation: () => TResult | Promise<TResult>): Promise<TResult>;

  abstract register(
    condition: NavigationBlockerCondition,
    options?: NavigationBlockerRegistrationOptions,
  ): NavigationBlockerRegistration;
}
