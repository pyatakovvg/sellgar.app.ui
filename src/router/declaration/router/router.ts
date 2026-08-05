import type { PolicyBoundaryDecision } from '../../../policy/contract/policy-boundary-decision';
import { createFirstAvailableRouteDefault, type FirstAvailableRouteDefault, type Route } from '../route';

export interface RouterOptions {
  readonly baseUrl?: string;
  readonly routes: Route[];
}

export class Router {
  readonly baseUrl: string | undefined;
  readonly routes: Route[];

  constructor(options: RouterOptions) {
    this.baseUrl = options.baseUrl;
    this.routes = options.routes;
  }

  static continue(): PolicyBoundaryDecision {
    return { type: 'continue' };
  }

  static error(error: unknown): PolicyBoundaryDecision {
    return { type: 'error', error };
  }

  static firstAvailable(): FirstAvailableRouteDefault {
    return createFirstAvailableRouteDefault();
  }

  static forbidden(): PolicyBoundaryDecision {
    return { type: 'forbidden' };
  }

  static notFound(): PolicyBoundaryDecision {
    return { type: 'not-found' };
  }

  static redirectTo(to: string, options: boolean | RouterRedirectOptions = false): PolicyBoundaryDecision {
    const redirectOptions = normalizeRedirectOptions(options);

    if (redirectOptions.saveCurrentLocation) {
      return {
        key: redirectOptions.key,
        replace: redirectOptions.replace,
        to,
        type: 'redirect-and-save-location',
      };
    }

    return {
      replace: redirectOptions.replace,
      to,
      type: 'redirect',
    };
  }

  static redirectToSaved(options: RouterRedirectToSavedOptions = {}): PolicyBoundaryDecision {
    return {
      fallback: options.fallback,
      key: options.key,
      replace: options.replace,
      type: 'redirect-to-saved-location',
    };
  }
}

export interface RouterRedirectOptions {
  readonly key?: string;
  readonly replace?: boolean;
  readonly saveCurrentLocation?: boolean;
}

export interface RouterRedirectToSavedOptions {
  readonly fallback?: string;
  readonly key?: string;
  readonly replace?: boolean;
}

const normalizeRedirectOptions = (options: boolean | RouterRedirectOptions): RouterRedirectOptions => {
  return typeof options === 'boolean' ? { replace: options } : options;
};
