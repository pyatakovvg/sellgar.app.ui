import { Inject, Injectable } from '../../../di/injection/decorators';

import { LocationServiceInterface } from '../location-service';

import type { NavigationContinuationOptions } from './navigation-continuation-service.interface.ts';
import { NavigationContinuationServiceInterface } from './navigation-continuation-service.interface.ts';

const DEFAULT_CONTINUATION_KEY = 'default';
const STORAGE_PREFIX = 'tiyn:navigation-continuation:';

@Injectable()
export class NavigationContinuationService extends NavigationContinuationServiceInterface {
  private readonly fallbackStorage = new Map<string, string>();

  constructor(
    @Inject(LocationServiceInterface)
    private readonly locationService: LocationServiceInterface,
  ) {
    super();
  }

  capture(target: string, options: NavigationContinuationOptions = {}): string | null {
    const normalizedTarget = this.normalizeTarget(target, options);

    if (normalizedTarget === null) {
      return null;
    }

    this.write(this.resolveKey(options), normalizedTarget);

    return normalizedTarget;
  }

  captureLocation(options: NavigationContinuationOptions = {}): string | null {
    const location = this.locationService.location;

    if (location === null) {
      return null;
    }

    return this.capture(`${location.pathname}${location.search}${location.hash}`, options);
  }

  captureRequest(request: Request, options: NavigationContinuationOptions = {}): string | null {
    const url = new URL(request.url);

    return this.capture(`${url.pathname}${url.search}${url.hash}`, options);
  }

  clear(options: NavigationContinuationOptions = {}): void {
    const key = this.resolveKey(options);

    this.fallbackStorage.delete(key);
    this.getStorage()?.removeItem(this.createStorageKey(key));
  }

  consume(options: NavigationContinuationOptions = {}): string | null {
    const key = this.resolveKey(options);
    const value = this.read(key);

    this.clear(options);

    return value === null ? null : this.normalizeTarget(value, options);
  }

  private createStorageKey(key: string): string {
    return `${STORAGE_PREFIX}${key}`;
  }

  private getStorage(): Storage | null {
    try {
      return globalThis.sessionStorage ?? null;
    } catch (error) {
      void error;

      return null;
    }
  }

  private normalizeBasePath(basePath: string | undefined): string | null {
    if (basePath === undefined || basePath === '/') {
      return null;
    }

    const normalizedBasePath = `/${basePath}`.replace(/\/+/g, '/').replace(/\/$/, '');

    return normalizedBasePath === '' ? null : normalizedBasePath;
  }

  private normalizeTarget(target: string, options: NavigationContinuationOptions): string | null {
    if (!target.startsWith('/') || target.startsWith('//')) {
      return null;
    }

    const basePath = this.normalizeBasePath(options.basePath);

    if (basePath === null) {
      return target;
    }

    const url = new URL(target, 'http://localhost');

    if (url.pathname === basePath) {
      url.pathname = '/';
    } else if (url.pathname.startsWith(`${basePath}/`)) {
      url.pathname = url.pathname.slice(basePath.length);
    }

    return `${url.pathname}${url.search}${url.hash}`;
  }

  private read(key: string): string | null {
    const storageValue = this.getStorage()?.getItem(this.createStorageKey(key)) ?? null;

    if (storageValue !== null) {
      return storageValue;
    }

    return this.fallbackStorage.get(key) ?? null;
  }

  private resolveKey(options: NavigationContinuationOptions): string {
    const key = options.key ?? DEFAULT_CONTINUATION_KEY;

    if (key.length === 0) {
      throw new Error('Ключ продолжения навигации не может быть пустым.');
    }

    return key;
  }

  private write(key: string, target: string): void {
    this.fallbackStorage.set(key, target);
    this.getStorage()?.setItem(this.createStorageKey(key), target);
  }
}
