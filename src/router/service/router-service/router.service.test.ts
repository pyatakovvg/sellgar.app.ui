import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';
import { Expose, Transform, Type } from 'class-transformer';
import { IsNumber, IsString, ValidateNested } from 'class-validator';

import { BindingModuleInterface } from '../../../di/binding/binding-module';
import { Injectable } from '../../../di/injection/decorators';
import { UseBindings } from '../../../di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { ApplicationScope } from '../../../runtime/scope/kind';

import { ClassTransformerRouterParamsConverter } from '../../params/class-transformer-router-params-converter';
import { LocationServiceInterface } from '../location-service';
import { NavigateServiceInterface } from '../navigate-service';
import { RouterServiceControllerInterface } from '../router-service-controller';

import { RouterServiceBindings } from './router-service.bindings.ts';
import { RouterService } from './router.service.ts';

describe('RouterService', () => {
  it('stores location snapshots and notifies subscribers', () => {
    const service = createRouterService();
    const listener = vi.fn();

    service.subscribe(listener);
    service.syncLocation({
      hash: '#details',
      key: 'location:1',
      params: {},
      pathname: '/reports',
      search: '?page=1',
      state: { source: 'test' },
    });

    expect(service.location).toEqual({
      hash: '#details',
      hashParams: {
        details: 'null',
      },
      key: 'location:1',
      params: {},
      pathname: '/reports',
      search: '?page=1',
      searchParams: {
        page: '1',
      },
      state: { source: 'test' },
    });
    expect(listener).toHaveBeenCalledWith(service.location);
  });

  it('disposes location subscriptions', () => {
    const service = createRouterService();
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);

    unsubscribe();
    service.syncLocation({
      hash: '',
      key: 'location:1',
      params: {},
      pathname: '/reports',
      search: '',
      state: null,
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('parses hash params into location snapshot', () => {
    const service = createRouterService();

    service.syncLocation({
      hash: "#terminal(id='123'&nullable)&flag",
      key: 'location:1',
      params: {},
      pathname: '/reports',
      search: '',
      state: null,
    });

    expect(service.location?.hashParams).toEqual({
      flag: 'null',
      terminal: {
        id: '123',
        nullable: 'null',
      },
    });
  });

  it('converts hash search and route params to dto-shaped objects', () => {
    const service = createRouterService();

    service.syncLocation({
      hash: "#drawer(id='42')",
      key: 'location:1',
      params: {
        page: '3',
      },
      pathname: '/reports',
      search: '?page=2&search=terminal',
      state: null,
    });

    expect(service.hashToObject(DrawerHashDto)).toEqual({
      drawer: {
        id: '42',
      },
    });
    expect(
      service.searchToObject(FilterSearchDto, {
        enableTypeConversion: true,
      }),
    ).toEqual({
      page: 2,
      search: 'terminal',
    });
    expect(
      service.paramsToObject(RouteParamsDto, {
        enableTypeConversion: true,
      }),
    ).toEqual({
      page: 3,
    });
  });

  it('throws dto validation errors during conversion', () => {
    const service = createRouterService();

    service.syncLocation({
      hash: '',
      key: 'location:1',
      params: {},
      pathname: '/reports',
      search: '?page=invalid',
      state: null,
    });

    expect(() =>
      service.searchToObject(FilterSearchDto, {
        enableTypeConversion: true,
      }),
    ).toThrow();
  });

  it('matches current pathname by route segment boundary', () => {
    const service = createRouterService();

    expect(service.matches('/')).toBe(true);
    expect(service.matches('/employees')).toBe(false);

    service.syncLocation({
      hash: '',
      key: 'location:1',
      params: {},
      pathname: '/employees/invitations',
      search: '',
      state: null,
    });

    expect(service.matches('/employees')).toBe(true);
    expect(service.matches('/employees-old')).toBe(false);
    expect(service.matches('/employees', { end: true })).toBe(false);
    expect(service.matches('/employees/invitations', { end: true })).toBe(true);
  });

  it('delegates navigate replace and back to attached navigator', async () => {
    const service = createRouterService();
    const back = vi.fn();
    const navigate = vi.fn();

    service.attachNavigator({ back, navigate });

    await service.to('/reports', { state: { page: 1 } });
    await service.replace('/sign-in', { state: { from: '/reports' } });
    await service.back();

    expect(navigate).toHaveBeenNthCalledWith(1, '/reports', {
      state: { page: 1 },
    });
    expect(navigate).toHaveBeenNthCalledWith(2, '/sign-in', {
      replace: true,
      state: { from: '/reports' },
    });
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('navigates hash params with merge and converted base values', async () => {
    const service = createRouterService();
    const navigate = vi.fn();

    service.attachNavigator({ back: vi.fn(), navigate });
    service.syncLocation({
      hash: "#enabled=true&terminal(id='123')",
      key: 'location:1',
      params: {},
      pathname: '/reports',
      search: '?page=1',
      state: null,
    });

    await service.hashParams({
      terminal: undefined,
      user: {
        id: '42',
      },
    });

    expect(navigate).toHaveBeenCalledWith("/reports?page=1#enabled=true&user(id='42')", {
      replace: true,
    });
  });

  it('uses latest hash params for sequential hash navigation', async () => {
    const service = createRouterService();
    const navigate = vi.fn();

    service.attachNavigator({ back: vi.fn(), navigate });
    service.syncLocation({
      hash: "#registrationReview(id='1')",
      key: 'location:1',
      params: {},
      pathname: '/reports',
      search: '',
      state: null,
    });

    await service.hashParams({
      registrationReview: undefined,
    });
    await service.hashParams({
      registrationEdit: {
        id: '1',
      },
    });

    expect(navigate).toHaveBeenLastCalledWith("/reports#registrationEdit(id='1')", {
      replace: true,
    });
  });

  it('navigates hash params without merge', async () => {
    const service = createRouterService();
    const navigate = vi.fn();

    service.attachNavigator({ back: vi.fn(), navigate });
    service.syncLocation({
      hash: "#enabled=true&terminal(id='123')",
      key: 'location:1',
      params: {},
      pathname: '/reports',
      search: '',
      state: null,
    });

    await service.hashParams(
      {
        user: {
          id: '42',
        },
      },
      {
        merge: false,
        replace: false,
      },
    );

    expect(navigate).toHaveBeenCalledWith("/reports#user(id='42')", {
      replace: false,
    });
  });

  it('navigates search params with merge and clearUndefined', async () => {
    const service = createRouterService();
    const navigate = vi.fn();

    service.attachNavigator({ back: vi.fn(), navigate });
    service.syncLocation({
      hash: "#drawer(id='42')",
      key: 'location:1',
      params: {},
      pathname: '/reports',
      search: '?page=1&search=terminal',
      state: null,
    });

    await service.searchParams({
      page: 2,
      search: undefined,
    });

    expect(navigate).toHaveBeenCalledWith("/reports?page=2#drawer(id='42')", {
      replace: true,
    });
  });

  it('rejects navigation before adapter is attached', async () => {
    const service = createRouterService();

    await expect(service.to('/reports')).rejects.toThrow('Адаптер навигации роутера не подключен.');
  });

  it('detaches navigator with attach disposable', async () => {
    const service = createRouterService();
    const navigate = vi.fn();
    const detach = service.attachNavigator({
      back: vi.fn(),
      navigate,
    });

    detach();

    await expect(service.back()).rejects.toThrow('Адаптер навигации роутера не подключен.');
  });

  it('binds public and controller interfaces to one singleton', () => {
    const scope = new ApplicationScope();

    scope.activate(TestRouterServiceOwner);

    const locationService = scope.get(LocationServiceInterface);
    const navigateService = scope.get(NavigateServiceInterface);
    const controllerService = scope.get(RouterServiceControllerInterface);

    expect(locationService).toBe(controllerService);
    expect(navigateService).toBe(controllerService);
  });
});

const createRouterService = (): RouterService => {
  return new RouterService(new ClassTransformerRouterParamsConverter());
};

class DrawerHashValueDto {
  @Expose()
  @IsString()
  id!: string;
}

class DrawerHashDto {
  @Expose()
  @Type(() => DrawerHashValueDto)
  @ValidateNested()
  drawer!: DrawerHashValueDto;
}

class FilterSearchDto {
  @Expose()
  @IsNumber()
  page!: number;

  @Expose()
  @IsString()
  @Transform(({ value }) => (value ? String(value) : undefined))
  search!: string;
}

class RouteParamsDto {
  @Expose()
  @Type(() => Number)
  @IsNumber()
  page!: number;
}

class TestRouterServiceBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    const bindings = new RouterServiceBindings();

    bindings.register(registry);
  }
}

@Injectable()
@UseBindings(TestRouterServiceBindings)
class TestRouterServiceOwner {}
