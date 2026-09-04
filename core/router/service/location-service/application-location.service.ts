import type { NavigationState } from '../../runtime/navigation-state';
import type {
  RouterParamsConstructor,
  RouterParamsConverterInterface,
  RouterParamsObjectOptions,
} from '../../params/router-params-converter';
import type {
  LocationServiceInterface,
  LocationServiceListener,
  RouterLocationSnapshot,
} from './location-service.interface.ts';

export class ApplicationLocationService implements LocationServiceInterface {
  private readonly listeners = new Set<LocationServiceListener>();
  private snapshot: RouterLocationSnapshot | null = null;

  constructor(private readonly converter: RouterParamsConverterInterface) {}

  get location(): RouterLocationSnapshot | null {
    return this.snapshot;
  }

  paramsToObject<TValue extends object>(
    target: RouterParamsConstructor<TValue>,
    options?: RouterParamsObjectOptions,
  ): TValue {
    return this.converter.toObject(target, this.getActiveLocation().params, options);
  }

  subscribe(listener: LocationServiceListener): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  sync(navigation: NavigationState): void {
    this.snapshot = Object.freeze({
      params: EMPTY_PARAMS,
      state: navigation.state,
    });
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  private getActiveLocation(): RouterLocationSnapshot {
    return this.snapshot ?? EMPTY_LOCATION;
  }
}

const EMPTY_PARAMS = Object.freeze({});
const EMPTY_LOCATION = Object.freeze({ params: EMPTY_PARAMS, state: undefined });
