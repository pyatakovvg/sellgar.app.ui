import type { RouterParamsConstructor, RouterParamsObjectOptions } from '../../params/router-params-converter';
import type { RouterHashObject } from '../../utils/hash-utils';
import type { RouteMatchOptions } from '../../utils/path-match';
import type { RouterSearchObject } from '../../utils/search-utils';

export type { RouteMatchOptions } from '../../utils/path-match';

export interface RouterLocationSnapshot {
  readonly hash: string;
  readonly hashParams: RouterHashObject;
  readonly key: string;
  readonly params: Record<string, string | undefined>;
  readonly pathname: string;
  readonly search: string;
  readonly searchParams: RouterSearchObject;
  readonly state: unknown;
}

export type LocationServiceListener = (location: RouterLocationSnapshot | null) => void;

export abstract class LocationServiceInterface {
  abstract get location(): RouterLocationSnapshot | null;

  abstract matches(path: string, options?: RouteMatchOptions): boolean;

  abstract hashToObject<TValue extends object>(
    target: RouterParamsConstructor<TValue>,
    options?: RouterParamsObjectOptions,
  ): TValue;

  abstract paramsToObject<TValue extends object>(
    target: RouterParamsConstructor<TValue>,
    options?: RouterParamsObjectOptions,
  ): TValue;

  abstract searchToObject<TValue extends object>(
    target: RouterParamsConstructor<TValue>,
    options?: RouterParamsObjectOptions,
  ): TValue;

  abstract subscribe(listener: LocationServiceListener): () => void;
}
