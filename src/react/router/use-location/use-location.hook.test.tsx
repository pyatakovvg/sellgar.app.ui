import 'reflect-metadata';

import { act, renderHook } from '@testing-library/react';
import { Expose, Transform } from 'class-transformer';
import { IsNumber, IsString } from 'class-validator';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { BindingModuleInterface } from '../../../di/binding/binding-module';
import { Injectable } from '../../../di/injection/decorators';
import { UseBindings } from '../../../di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { RouterServiceBindings } from '../../../router/service/router-service';
import { RouterServiceControllerInterface } from '../../../router/service/router-service-controller';
import { ApplicationScope } from '../../../runtime/scope/kind';
import { RuntimeScopeProvider } from '../../../runtime/react';

import { useNavigate } from '../use-navigate';

import { useLocation } from './use-location.hook.ts';

describe('router access hooks', () => {
  it('returns reactive location snapshot with dto conversion helpers', () => {
    const { controller, wrapper } = createRouterHookTestContext();

    controller.syncLocation({
      hash: "#drawer(id='42')",
      key: 'location:1',
      params: {
        page: '3',
      },
      pathname: '/reports',
      search: '?page=2&search=terminal',
      state: null,
    });

    const { result } = renderHook(() => useLocation(), {
      wrapper,
    });

    expect(result.current.pathname).toBe('/reports');
    expect(result.current.matches('/reports', { end: true })).toBe(true);
    expect(
      result.current.searchToObject(FilterSearchDto, {
        enableTypeConversion: true,
      }),
    ).toEqual({
      page: 2,
      search: 'terminal',
    });

    act(() => {
      controller.syncLocation({
        hash: '',
        key: 'location:2',
        params: {},
        pathname: '/users',
        search: '',
        state: null,
      });
    });

    expect(result.current.pathname).toBe('/users');
    expect(result.current.matches('/reports')).toBe(false);
    expect(result.current.matches('/users', { end: true })).toBe(true);
  });

  it('returns navigate service commands', async () => {
    const { controller, wrapper } = createRouterHookTestContext();
    const navigate = vi.fn();

    controller.attachNavigator({
      back: vi.fn(),
      navigate,
    });

    const { result } = renderHook(() => useNavigate(), {
      wrapper,
    });

    await result.current.to('/reports', {
      state: {
        source: 'hook',
      },
    });

    expect(result.current).toBeTypeOf('object');
    expect(navigate).toHaveBeenCalledWith('/reports', {
      state: {
        source: 'hook',
      },
    });
  });
});

const createRouterHookTestContext = (): RouterHookTestContext => {
  const scope = new ApplicationScope();

  scope.activate(TestRouterHookOwner);

  return {
    controller: scope.get(RouterServiceControllerInterface),
    wrapper: ({ children }) => {
      return <RuntimeScopeProvider scope={scope}>{children}</RuntimeScopeProvider>;
    },
  };
};

interface RouterHookTestContext {
  readonly controller: RouterServiceControllerInterface;
  readonly wrapper: React.FC<React.PropsWithChildren>;
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

class TestRouterHookBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    const bindings = new RouterServiceBindings();

    bindings.register(registry);
  }
}

@Injectable()
@UseBindings(TestRouterHookBindings)
class TestRouterHookOwner {}
