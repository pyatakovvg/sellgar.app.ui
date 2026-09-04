export type RouterParamsConstructor<TValue extends object> = new (...args: any[]) => TValue;

export interface RouterParamsObjectOptions {
  readonly enableTypeConversion?: boolean;
}

export abstract class RouterParamsConverterInterface {
  abstract toObject<TValue extends object>(
    target: RouterParamsConstructor<TValue>,
    params: Readonly<Record<string, unknown>>,
    options?: RouterParamsObjectOptions,
  ): TValue;
}
