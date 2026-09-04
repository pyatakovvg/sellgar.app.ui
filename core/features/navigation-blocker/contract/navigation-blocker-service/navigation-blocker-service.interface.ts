export type NavigationBlockerCondition = () => boolean;
export type NavigationBlockerDecisionHandler = () => void;

export interface NavigationBlockerRegistrationOptions {
  readonly onLeave?: NavigationBlockerDecisionHandler;
  readonly onStay?: NavigationBlockerDecisionHandler;
}

declare const navigationBlockerRegistrationIdentityBrand: unique symbol;

export type NavigationBlockerRegistrationIdentity = number & {
  readonly [navigationBlockerRegistrationIdentityBrand]: true;
};

export interface NavigationBlockerRegistration {
  readonly identity: NavigationBlockerRegistrationIdentity;

  dispose(): void;
}

export abstract class NavigationBlockerServiceInterface {
  abstract allow<TResult>(operation: () => TResult | Promise<TResult>): Promise<TResult>;

  abstract register(
    condition: NavigationBlockerCondition,
    options?: NavigationBlockerRegistrationOptions,
  ): NavigationBlockerRegistration;
}
