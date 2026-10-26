import type { RouteParams, RouteToken } from '../../declaration/route-token';

export interface NavigateTerminalOptions {
  readonly query?: Readonly<Record<string, unknown>>;
  readonly replace?: boolean;
  readonly revalidate?: boolean;
  readonly state?: unknown;
}

export interface NavigateQueryOptions {
  readonly merge?: boolean;
  readonly replace?: boolean;
  readonly revalidate?: boolean;
  readonly state?: unknown;
}

export type NavigateResetOptions = Omit<NavigateTerminalOptions, 'replace'>;

type Exact<TActual, TExpected> = TActual & Record<Exclude<keyof TActual, keyof TExpected>, never>;

type TokenHasParams<TToken extends RouteToken> = keyof RouteParams<TToken> extends never ? false : true;

export type ThroughArguments<TToken extends RouteToken, TParams extends RouteParams<TToken>> =
  TokenHasParams<TToken> extends true
    ? [options: { readonly params: Exact<TParams, RouteParams<TToken>> }]
    : [options?: { readonly params?: never }];

export type NavigateArguments<TToken extends RouteToken, TParams extends RouteParams<TToken>> =
  TokenHasParams<TToken> extends true
    ? [options: NavigateTerminalOptions & { readonly params: Exact<TParams, RouteParams<TToken>> }]
    : [options?: NavigateTerminalOptions & { readonly params?: never }];

export type NavigateResetArguments<TToken extends RouteToken, TParams extends RouteParams<TToken>> =
  TokenHasParams<TToken> extends true
    ? [options: NavigateResetOptions & { readonly params: Exact<TParams, RouteParams<TToken>> }]
    : [options?: NavigateResetOptions & { readonly params?: never }];

export interface NavigateThrough {
  resetTo<const TToken extends RouteToken, const TParams extends RouteParams<TToken> = RouteParams<TToken>>(
    token: TToken,
    ...args: NavigateResetArguments<TToken, TParams>
  ): Promise<void>;

  through<const TToken extends RouteToken, const TParams extends RouteParams<TToken> = RouteParams<TToken>>(
    token: TToken,
    ...args: ThroughArguments<TToken, TParams>
  ): NavigateThrough;

  to<const TToken extends RouteToken, const TParams extends RouteParams<TToken> = RouteParams<TToken>>(
    token: TToken,
    ...args: NavigateArguments<TToken, TParams>
  ): Promise<void>;
}

export abstract class NavigateServiceInterface implements NavigateThrough {
  abstract resetTo<const TToken extends RouteToken, const TParams extends RouteParams<TToken> = RouteParams<TToken>>(
    token: TToken,
    ...args: NavigateResetArguments<TToken, TParams>
  ): Promise<void>;

  abstract back(): Promise<void>;

  abstract close(): Promise<void>;

  abstract root(options?: NavigateTerminalOptions): Promise<void>;

  abstract query(query: Readonly<Record<string, unknown>>, options?: NavigateQueryOptions): Promise<void>;

  abstract through<const TToken extends RouteToken, const TParams extends RouteParams<TToken> = RouteParams<TToken>>(
    token: TToken,
    ...args: ThroughArguments<TToken, TParams>
  ): NavigateThrough;

  abstract to<const TToken extends RouteToken, const TParams extends RouteParams<TToken> = RouteParams<TToken>>(
    token: TToken,
    ...args: NavigateArguments<TToken, TParams>
  ): Promise<void>;
}
