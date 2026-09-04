import type { RouterParamsConstructor, RouterParamsObjectOptions } from '../../params/router-params-converter';

export interface RouterLocationSnapshot {
  readonly params: Readonly<Record<string, unknown>>;
  readonly state: unknown;
}

export type LocationServiceListener = (location: RouterLocationSnapshot | null) => void;

export abstract class LocationServiceInterface {
  abstract get location(): RouterLocationSnapshot | null;

  abstract paramsToObject<TValue extends object>(
    target: RouterParamsConstructor<TValue>,
    options?: RouterParamsObjectOptions,
  ): TValue;

  abstract subscribe(listener: LocationServiceListener): () => void;
}
