export type RouteToken<TInstance extends object = object> = abstract new (...args: never[]) => TInstance;

type RouteDataKey<TInstance> = {
  [TKey in keyof TInstance]-?: TKey extends string ? (TInstance[TKey] extends CallableFunction ? never : TKey) : never;
}[keyof TInstance];

export type RouteParams<TToken extends RouteToken> = Pick<InstanceType<TToken>, RouteDataKey<InstanceType<TToken>>>;

export type RouteParamKey<TToken extends RouteToken> = keyof RouteParams<TToken> & string;

export interface RouteMatchOptions<TToken extends RouteToken> {
  readonly end?: boolean;
  readonly params?: RouteParams<TToken>;
}
