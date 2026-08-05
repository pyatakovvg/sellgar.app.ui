import { Inject, Injectable } from '../../../di/injection/decorators';

import type { RouterParamsConstructor, RouterParamsObjectOptions } from '../../params/router-params-converter';
import { RouterParamsConverterInterface } from '../../params/router-params-converter';
import { createHashFromObject, parseHashToObject } from '../../utils/hash-utils';
import { matchPathname, type RouteMatchOptions } from '../../utils/path-match';
import { parseSearchParams, updateSearchParams } from '../../utils/search-utils';
import type { LocationServiceListener, RouterLocationSnapshot } from '../location-service';
import { LocationServiceInterface } from '../location-service';
import { NavigateServiceInterface } from '../navigate-service';
import type {
  RouterHashNavigateOptions,
  RouterNavigateOptions,
  RouterSearchNavigateOptions,
} from '../navigate-service';
import type { RouterNavigator } from '../router-service-controller';
import { RouterServiceControllerInterface } from '../router-service-controller';

@Injectable()
export class RouterService
  extends LocationServiceInterface
  implements NavigateServiceInterface, RouterServiceControllerInterface
{
  private readonly listeners = new Set<LocationServiceListener>();

  private currentLocation: RouterLocationSnapshot | null = null;
  private navigator: RouterNavigator | null = null;

  constructor(
    @Inject(RouterParamsConverterInterface)
    private readonly paramsConverter: RouterParamsConverterInterface,
  ) {
    super();
  }

  get location(): RouterLocationSnapshot | null {
    return this.currentLocation;
  }

  attachNavigator(navigator: RouterNavigator): () => void {
    this.navigator = navigator;

    return () => {
      if (this.navigator === navigator) {
        this.navigator = null;
      }
    };
  }

  async back(): Promise<void> {
    if (!this.navigator) {
      throw new Error('Адаптер навигации роутера не подключен.');
    }

    await this.navigator.back();
  }

  async hashParams(to: RouterLocationSnapshot['hashParams'], options: RouterHashNavigateOptions = {}): Promise<void> {
    const location = this.getActiveLocation();
    const merge = options.merge ?? true;
    const base = merge
      ? parseHashToObject(location.hash, {
          enableTypeConversion: options.enableTypeConversion ?? true,
        })
      : {};
    const newHash = createHashFromObject({
      ...base,
      ...to,
    });
    const target = newHash
      ? `${location.pathname}${location.search}#${newHash}`
      : `${location.pathname}${location.search}`;

    await this.to(target, {
      replace: options.replace ?? true,
      state: options.state,
    });
    this.currentLocation = {
      ...location,
      hash: newHash ? `#${newHash}` : '',
      hashParams: parseHashToObject(newHash, {
        enableTypeConversion: options.enableTypeConversion ?? true,
      }),
      state: options.state ?? location.state,
    };
  }

  hashToObject<TValue extends object>(
    target: RouterParamsConstructor<TValue>,
    options?: RouterParamsObjectOptions,
  ): TValue {
    const location = this.getActiveLocation();
    const params = parseHashToObject(location.hash, options);

    return this.paramsConverter.toObject(target, params, options);
  }

  async to(to: string, options?: RouterNavigateOptions): Promise<void> {
    await this.navigateWithNavigator(to, options);
  }

  matches(path: string, options?: RouteMatchOptions): boolean {
    return matchPathname(this.getActiveLocation().pathname, path, options);
  }

  paramsToObject<TValue extends object>(
    target: RouterParamsConstructor<TValue>,
    options?: RouterParamsObjectOptions,
  ): TValue {
    return this.paramsConverter.toObject(target, this.getActiveLocation().params, options);
  }

  async replace(to: string, options: Omit<RouterNavigateOptions, 'replace'> = {}): Promise<void> {
    await this.to(to, {
      ...options,
      replace: true,
    });
  }

  async searchParams(
    to: RouterLocationSnapshot['searchParams'],
    options: RouterSearchNavigateOptions = {},
  ): Promise<void> {
    const location = this.getActiveLocation();
    const merge = options.merge ?? true;
    const currentSearch = merge ? location.search : '';
    const search = updateSearchParams(currentSearch, to, {
      clearUndefined: options.clearUndefined ?? true,
    });
    const target = search ? `${location.pathname}?${search}${location.hash}` : `${location.pathname}${location.hash}`;

    await this.to(target, {
      replace: options.replace ?? true,
    });
    this.currentLocation = {
      ...location,
      search: search ? `?${search}` : '',
      searchParams: parseSearchParams(search),
    };
  }

  searchToObject<TValue extends object>(
    target: RouterParamsConstructor<TValue>,
    options?: RouterParamsObjectOptions,
  ): TValue {
    const location = this.getActiveLocation();
    const params = parseSearchParams(location.search, options);

    return this.paramsConverter.toObject(target, params, options);
  }

  subscribe(listener: LocationServiceListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  syncLocation(
    location: Omit<RouterLocationSnapshot, 'hashParams' | 'searchParams'> & {
      readonly hashParams?: RouterLocationSnapshot['hashParams'];
      readonly searchParams?: RouterLocationSnapshot['searchParams'];
    },
  ): void {
    this.currentLocation = {
      ...location,
      hashParams: location.hashParams ?? parseHashToObject(location.hash),
      searchParams: location.searchParams ?? parseSearchParams(location.search),
    };
    this.listeners.forEach((listener) => {
      listener(this.currentLocation);
    });
  }

  private getActiveLocation(): RouterLocationSnapshot {
    if (this.currentLocation) {
      return this.currentLocation;
    }

    return {
      hash: '',
      hashParams: {},
      key: '',
      params: {},
      pathname: '/',
      search: '',
      searchParams: {},
      state: null,
    };
  }

  private async navigateWithNavigator(to: string, options?: RouterNavigateOptions): Promise<void> {
    if (!this.navigator) {
      throw new Error('Адаптер навигации роутера не подключен.');
    }

    await this.navigator.navigate(to, options);
  }
}
