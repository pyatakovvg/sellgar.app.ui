import type { RouterHashOptions } from '../../utils/hash-utils';

export type RouterParamsConstructor<TValue extends object> = new (...args: any[]) => TValue;

export interface RouterParamsObjectOptions extends RouterHashOptions {}

export abstract class RouterParamsConverterInterface {
  abstract toObject<TValue extends object>(
    target: RouterParamsConstructor<TValue>,
    params: Record<string, unknown>,
    options?: RouterParamsObjectOptions,
  ): TValue;
}
