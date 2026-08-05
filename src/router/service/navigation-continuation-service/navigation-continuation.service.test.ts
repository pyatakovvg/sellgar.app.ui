import { describe, expect, it } from 'vitest';

import type { RouterLocationSnapshot } from '../location-service';
import { LocationServiceInterface } from '../location-service';
import { matchPathname, type RouteMatchOptions } from '../../utils/path-match';

import { NavigationContinuationService } from './navigation-continuation.service.ts';

describe('NavigationContinuationService', () => {
  it('captures and consumes current location once', () => {
    const locationService = new TestLocationService({
      hash: "#registrationReview(id='9')",
      hashParams: {},
      key: 'location:1',
      params: {},
      pathname: '/terminals/registrations',
      search: '?page=2',
      searchParams: {},
      state: null,
    });
    const service = new NavigationContinuationService(locationService);

    expect(service.captureLocation()).toBe("/terminals/registrations?page=2#registrationReview(id='9')");
    expect(service.consume()).toBe("/terminals/registrations?page=2#registrationReview(id='9')");
    expect(service.consume()).toBeNull();
  });

  it('captures request url as app-relative target', () => {
    const service = new NavigationContinuationService(new TestLocationService(null));
    const request = new Request('http://localhost/terminals?status=active#terminal(id=1)');

    expect(service.captureRequest(request)).toBe('/terminals?status=active#terminal(id=1)');
    expect(service.consume()).toBe('/terminals?status=active#terminal(id=1)');
  });

  it('can strip router base path while capturing request url', () => {
    const service = new NavigationContinuationService(new TestLocationService(null));
    const request = new Request('http://localhost/app/terminals?status=active#terminal(id=1)');

    expect(service.captureRequest(request, { basePath: '/app/' })).toBe('/terminals?status=active#terminal(id=1)');
    expect(service.consume()).toBe('/terminals?status=active#terminal(id=1)');
  });

  it('can strip router base path while consuming stored target', () => {
    const service = new NavigationContinuationService(new TestLocationService(null));

    service.capture('/app/users');

    expect(service.consume({ basePath: '/app/' })).toBe('/users');
  });

  it('keeps independent named continuations', () => {
    const service = new NavigationContinuationService(new TestLocationService(null));

    service.capture('/terminals', { key: 'first' });
    service.capture('/users', { key: 'second' });

    expect(service.consume({ key: 'second' })).toBe('/users');
    expect(service.consume({ key: 'first' })).toBe('/terminals');
  });

  it('ignores external targets', () => {
    const service = new NavigationContinuationService(new TestLocationService(null));

    expect(service.capture('https://example.com')).toBeNull();
    expect(service.capture('//example.com')).toBeNull();
    expect(service.consume()).toBeNull();
  });
});

class TestLocationService extends LocationServiceInterface {
  constructor(private readonly snapshot: RouterLocationSnapshot | null) {
    super();
  }

  get location(): RouterLocationSnapshot | null {
    return this.snapshot;
  }

  matches(path: string, options?: RouteMatchOptions): boolean {
    return matchPathname(this.snapshot?.pathname ?? '/', path, options);
  }

  hashToObject<TValue extends object>(): TValue {
    throw new Error('Не реализовано.');
  }

  paramsToObject<TValue extends object>(): TValue {
    throw new Error('Не реализовано.');
  }

  searchToObject<TValue extends object>(): TValue {
    throw new Error('Не реализовано.');
  }

  subscribe(): () => void {
    return () => {};
  }
}
