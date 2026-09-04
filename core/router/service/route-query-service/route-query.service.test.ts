import { Transform } from 'class-transformer';
import { IsInt, IsString } from 'class-validator';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { segments } from '../../declaration/address';
import { Query, type QueryValue } from '../../declaration/query';
import { Route } from '../../declaration/route';
import { Router } from '../../declaration/router';
import type { NavigationState } from '../../runtime/navigation-state';
import type { NavigateServiceInterface } from '../navigate-service';
import { ApplicationRouteQueryService } from './application-route-query.service.ts';
import { ScopedRouteQueryService } from './scoped-route-query.service.ts';

class ModuleRoute {}
class FrameRoute {}

@Query()
class FilterQuery {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  brand: string;

  @IsInt()
  page: number;
}

@Query()
class SortQuery {
  @IsString()
  sort: string;
}

@Query()
class ConflictingFilterQuery {
  @IsString()
  brand: string;
}

const createNavigation = () => {
  const moduleRoute = new Route({ address: segments('module'), load: async () => ({}), token: ModuleRoute });
  const frameRoute = new Route({ address: segments('frame'), load: async () => ({}), token: FrameRoute });
  const frameRouter = new Router({ routes: [frameRoute] });
  const rootRouter = new Router({ routes: [moduleRoute] });
  const navigation = {
    boundary: null,
    initiator: null,
    pendingNestedAddress: null,
    replace: false,
    revalidation: null,
    root: {
      child: {
        child: null,
        owner: moduleRoute,
        path: [{ params: {}, route: frameRoute, token: FrameRoute }],
        query: { a: 4, b: 8, c: 9 },
        router: frameRouter,
      },
      owner: null,
      path: [{ params: {}, route: moduleRoute, token: ModuleRoute }],
      query: { a: 1, b: 2, brand: 'nike', sort: 'name' },
      router: rootRouter,
    },
    state: undefined,
  } as NavigationState;

  return { navigation, rootRouter };
};

describe('ApplicationRouteQueryService', () => {
  it('reads current and foreign Router query by a human-readable route token', () => {
    const { navigation } = createNavigation();
    const service = new ApplicationRouteQueryService();

    service.sync(navigation);

    expect(service.current()).toEqual({ a: 1, b: 2, brand: 'nike', sort: 'name' });
    expect(service.route(ModuleRoute)).toEqual({ a: 1, b: 2, brand: 'nike', sort: 'name' });
    expect(service.route(FrameRoute)).toEqual({ a: 4, b: 8, c: 9 });
  });

  it('reads declarations without @Expose, optional markers or defaults and types missing values as optional', () => {
    const { navigation } = createNavigation();
    const service = new ApplicationRouteQueryService();

    service.sync(navigation);

    const result = service.get(FilterQuery);

    expectTypeOf(result).toEqualTypeOf<QueryValue<FilterQuery>>();
    expect(result).toBeInstanceOf(FilterQuery);
    expect(result).toEqual({ brand: 'nike', page: undefined });
    expect(Reflect.has(result, 'a')).toBe(false);
  });

  it('combines several independent @Query declarations into one typed filter', () => {
    const { navigation } = createNavigation();
    const service = new ApplicationRouteQueryService();

    service.sync(navigation);

    const result = service.get(FilterQuery, SortQuery);

    expectTypeOf(result).toEqualTypeOf<QueryValue<FilterQuery> & QueryValue<SortQuery>>();
    expect(result).toEqual({ brand: 'nike', page: undefined, sort: 'name' });
  });

  it('rejects overlapping keys in aggregated @Query declarations', () => {
    const { navigation } = createNavigation();
    const service = new ApplicationRouteQueryService();

    service.sync(navigation);

    expect(() => service.get(FilterQuery, ConflictingFilterQuery)).toThrow(
      'Query-классы FilterQuery и ConflictingFilterQuery объявляют общий ключ "brand".',
    );
  });
});

describe('ScopedRouteQueryService', () => {
  const createService = () => {
    const { navigation, rootRouter } = createNavigation();
    const source = new ApplicationRouteQueryService();
    const query = vi.fn().mockResolvedValue(undefined);
    const navigate = { query } as unknown as NavigateServiceInterface;

    source.sync(navigation);

    return {
      query,
      service: new ScopedRouteQueryService(source, rootRouter, navigate),
    };
  };

  it('replaces only fields owned by the concrete @Query class', async () => {
    const { query, service } = createService();

    await service.set(FilterQuery, { page: 2 });

    expect(query).toHaveBeenCalledWith({ brand: null, page: 2 }, { merge: true });
  });

  it('applies field transforms before writing a query replacement', async () => {
    const { query, service } = createService();

    await service.set(FilterQuery, { brand: '  nike  ' });

    expect(query).toHaveBeenCalledWith({ brand: 'nike', page: null }, { merge: true });
  });

  it('removes a transformed empty value from the query replacement', async () => {
    const { query, service } = createService();

    await service.set(FilterQuery, { brand: '   ' });

    expect(query).toHaveBeenCalledWith({ brand: null, page: null }, { merge: true });
  });

  it('clears only fields owned by the concrete @Query class', async () => {
    const { query, service } = createService();

    await service.clear(FilterQuery);

    expect(query).toHaveBeenCalledWith({ brand: null, page: null }, { merge: true });
  });

  it('validates values present in a query replacement', async () => {
    const { service } = createService();

    await expect(service.set(FilterQuery, { page: 'wrong' } as never)).rejects.toBeDefined();
  });
});
