import type { RouteParams, RouteToken } from '../../declaration/route-token';
import type { NavigateArguments, NavigateTerminalOptions, ThroughArguments } from '../navigate-service';

export interface NavigationRequestBinding {
  readonly params: Readonly<Record<string, unknown>>;
  readonly token: RouteToken;
}

export interface NavigationRequest {
  readonly bindings: readonly NavigationRequestBinding[];
  readonly options: NavigateTerminalOptions & {
    readonly params?: Readonly<Record<string, unknown>>;
  };
  readonly token: RouteToken;
}

export interface NavigationRequestBuilder {
  through<const TToken extends RouteToken, const TParams extends RouteParams<TToken> = RouteParams<TToken>>(
    token: TToken,
    ...args: ThroughArguments<TToken, TParams>
  ): NavigationRequestBuilder;

  to<const TToken extends RouteToken, const TParams extends RouteParams<TToken> = RouteParams<TToken>>(
    token: TToken,
    ...args: NavigateArguments<TToken, TParams>
  ): NavigationRequest;
}

export type NavigationRequestFactory = (navigate: NavigationRequestBuilder) => NavigationRequest;

export const createNavigationRequest = (factory: NavigationRequestFactory): NavigationRequest => {
  return factory(new CoreNavigationRequestBuilder([]));
};

export const createTerminalNavigationRequest = (
  bindings: readonly NavigationRequestBinding[],
  token: RouteToken,
  options?: NavigateTerminalOptions & { readonly params?: Readonly<Record<string, unknown>> },
): NavigationRequest => {
  return Object.freeze({
    bindings: Object.freeze([...bindings]),
    options: freezeTerminalOptions(options),
    token,
  });
};

export const createNavigationRequestBinding = (
  token: RouteToken,
  options?: { readonly params?: Readonly<Record<string, unknown>> },
): NavigationRequestBinding => {
  return Object.freeze({
    params: Object.freeze({ ...(options?.params ?? {}) }),
    token,
  });
};

class CoreNavigationRequestBuilder implements NavigationRequestBuilder {
  constructor(private readonly bindings: readonly NavigationRequestBinding[]) {}

  through<TToken extends RouteToken, TParams extends RouteParams<TToken> = RouteParams<TToken>>(
    token: TToken,
    ...args: ThroughArguments<TToken, TParams>
  ): NavigationRequestBuilder {
    return new CoreNavigationRequestBuilder([...this.bindings, createNavigationRequestBinding(token, args[0])]);
  }

  to<TToken extends RouteToken, TParams extends RouteParams<TToken> = RouteParams<TToken>>(
    token: TToken,
    ...args: NavigateArguments<TToken, TParams>
  ): NavigationRequest {
    return createTerminalNavigationRequest(this.bindings, token, args[0]);
  }
}

const freezeTerminalOptions = (
  options?: NavigateTerminalOptions & { readonly params?: Readonly<Record<string, unknown>> },
): NavigateTerminalOptions & { readonly params?: Readonly<Record<string, unknown>> } => {
  if (!options) {
    return Object.freeze({});
  }

  return Object.freeze({
    ...options,
    params: options.params ? Object.freeze({ ...options.params }) : undefined,
    query: options.query ? Object.freeze({ ...options.query }) : undefined,
  });
};
