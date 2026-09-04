const QUERY_METADATA_KEY = Symbol('tiyn-app:router:query:metadata');

export type QueryConstructor<TQuery extends object = object> = new () => TQuery;
export type QueryConstructors = readonly [QueryConstructor, ...QueryConstructor[]];

type QueryDataKey<TQuery extends object> = {
  [TKey in keyof TQuery]-?: TKey extends string ? (TQuery[TKey] extends CallableFunction ? never : TKey) : never;
}[keyof TQuery];

export type QueryValue<TQuery extends object> = {
  readonly [TKey in QueryDataKey<TQuery>]?: TQuery[TKey];
};

type QueryConstructorValue<TTarget extends QueryConstructor> =
  TTarget extends QueryConstructor<infer TQuery> ? QueryValue<TQuery> : never;

type UnionToIntersection<TValue> = (TValue extends unknown ? (value: TValue) => void : never) extends (
  value: infer TIntersection,
) => void
  ? TIntersection
  : never;

export type QueryValues<TTargets extends QueryConstructors> = UnionToIntersection<
  QueryConstructorValue<TTargets[number]>
>;

export type QueryInput<TQuery extends object> = {
  readonly [TKey in QueryDataKey<TQuery>]?: TQuery[TKey] | null;
};

export interface QueryOptions {
  readonly enableTypeConversion?: boolean;
}

export interface QueryMetadata {
  readonly enableTypeConversion: boolean;
  readonly keys: readonly string[];
}

export type QueryDecorator = <TConstructor extends QueryConstructor>(constructor: TConstructor) => void;

export const Query = (options: QueryOptions = {}): QueryDecorator => {
  return (constructor) => {
    const instance = new constructor();
    const metadata: QueryMetadata = Object.freeze({
      enableTypeConversion: options.enableTypeConversion ?? false,
      keys: Object.freeze(Object.keys(instance)),
    });

    Reflect.defineMetadata(QUERY_METADATA_KEY, metadata, constructor);
  };
};

export const isQueryConstructor = (value: unknown): value is QueryConstructor => {
  return typeof value === 'function' && Reflect.hasOwnMetadata(QUERY_METADATA_KEY, value);
};

export const getQueryMetadata = (query: QueryConstructor): QueryMetadata => {
  const metadata = Reflect.getOwnMetadata(QUERY_METADATA_KEY, query) as QueryMetadata | undefined;

  if (!metadata) {
    throw new Error('Класс query должен быть помечен декоратором @Query().');
  }

  return metadata;
};
