import type {
  NavigationBlockerCondition,
  NavigationBlockerRegistration,
  NavigationBlockerRegistrationOptions,
} from '../../contract/navigation-blocker-service';
import { NavigationBlockerServiceInterface } from '../../contract/navigation-blocker-service';
import type { NavigationBlockerBoundary } from './navigation-blocker-boundary.ts';
import type { NavigationBlockerRuntimeInterface } from './navigation-blocker-runtime.interface.ts';

export class NavigationBlockerService implements NavigationBlockerServiceInterface {
  constructor(
    private readonly runtime: NavigationBlockerRuntimeInterface,
    private readonly boundary: NavigationBlockerBoundary,
  ) {}

  allow<TResult>(operation: () => TResult | Promise<TResult>): Promise<TResult> {
    return this.runtime.allow(this.boundary, operation);
  }

  register(
    condition: NavigationBlockerCondition,
    options?: NavigationBlockerRegistrationOptions,
  ): NavigationBlockerRegistration {
    return this.runtime.register(this.boundary, condition, options?.presentation);
  }
}
