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

export class ScopedLocationService implements LocationServiceInterface {
  private readonly listeners = new Set<LocationServiceListener>();
  private readonly unsubscribeSource: () => void;
  private params: Readonly<Record<string, unknown>> = EMPTY_PARAMS;
  private pendingSnapshot: RouterLocationSnapshot | null = null;
  private scopedSnapshot: RouterLocationSnapshot | null = null;
  private sourceSnapshot: RouterLocationSnapshot | null = null;

  constructor(
    private readonly source: LocationServiceInterface,
    private readonly converter: RouterParamsConverterInterface,
  ) {
    this.unsubscribeSource = source.subscribe((location) => {
      if (location !== null && this.pendingSnapshot !== null && isSameLocation(location, this.pendingSnapshot)) {
        this.pendingSnapshot = null;
      }

      this.emit();
    });
  }

  get location(): RouterLocationSnapshot | null {
    if (this.pendingSnapshot !== null) {
      return this.pendingSnapshot;
    }

    const source = this.source.location;

    if (source === this.sourceSnapshot && this.scopedSnapshot?.params === this.params) {
      return this.scopedSnapshot;
    }

    this.sourceSnapshot = source;
    this.scopedSnapshot = source === null ? null : Object.freeze({ ...source, params: this.params });

    return this.scopedSnapshot;
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

  stage(params: Readonly<Record<string, unknown>>, state: unknown): void {
    this.params = params;
    this.pendingSnapshot = Object.freeze({ params, state });
    this.emit();
  }

  discardPending(): void {
    if (this.pendingSnapshot === null) {
      return;
    }

    this.pendingSnapshot = null;
    this.emit();
  }

  dispose(): void {
    this.unsubscribeSource();
    this.listeners.clear();
    this.pendingSnapshot = null;
    this.scopedSnapshot = null;
    this.sourceSnapshot = null;
  }

  private emit(): void {
    const location = this.location;

    this.listeners.forEach((listener) => listener(location));
  }

  private getActiveLocation(): RouterLocationSnapshot {
    const location = this.location;

    if (location === null) {
      throw new Error('Location активного RouteRuntime недоступен.');
    }

    return location;
  }
}

const isSameLocation = (left: RouterLocationSnapshot, right: RouterLocationSnapshot): boolean => {
  return Object.is(left.state, right.state);
};

const EMPTY_PARAMS = Object.freeze({});
