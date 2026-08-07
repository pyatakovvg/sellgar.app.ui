import 'reflect-metadata';

import { renderHook } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { UseBindings } from '../../../di/composition/use-bindings';
import { Injectable } from '../../../di/injection/decorators';
import { RouterServiceBindings } from '../../../router/service/router-service';
import { RouterServiceControllerInterface } from '../../../router/service/router-service-controller';
import { RuntimeScopeProvider } from '../../../runtime/react';
import { ApplicationScope } from '../../../runtime/scope/kind';

import { useRoutePending } from './';

const routerMocks = vi.hoisted(() => {
  return {
    useHref: vi.fn(),
    useNavigation: vi.fn(),
  };
});

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    useHref: routerMocks.useHref,
    useNavigation: routerMocks.useNavigation,
  };
});

describe('useRoutePending', () => {
  beforeEach(() => {
    routerMocks.useHref.mockImplementation((to: string) => to);
  });

  afterEach(() => {
    routerMocks.useHref.mockReset();
    routerMocks.useNavigation.mockReset();
  });

  it('returns false when router has no pending location', () => {
    const { wrapper } = createUseRoutePendingTestContext('/terminals');

    mockNavigation('idle');

    const { result } = renderHook(() => useRoutePending(), { wrapper });

    expect(result.current).toBe(false);
  });

  it('returns true when current route is pending', () => {
    const { wrapper } = createUseRoutePendingTestContext('/terminals');

    mockNavigation('loading', '/terminals');

    const { result } = renderHook(() => useRoutePending(), { wrapper });

    expect(result.current).toBe(true);
  });

  it('strips router base path from pending current route', () => {
    const { wrapper } = createUseRoutePendingTestContext('/terminals');

    mockHref('/terminals-management/terminals');
    mockNavigation('loading', '/terminals-management/terminals');

    const { result } = renderHook(() => useRoutePending(), { wrapper });

    expect(result.current).toBe(true);
  });

  it('supports explicit target and branch matching', () => {
    const { wrapper } = createUseRoutePendingTestContext('/employees/invitations');

    mockNavigation('loading', '/employees/invitations');

    const exact = renderHook(() => useRoutePending({ to: '/employees' }), { wrapper });
    const branch = renderHook(() => useRoutePending({ end: false, to: '/employees' }), { wrapper });

    expect(exact.result.current).toBe(false);
    expect(branch.result.current).toBe(true);
  });
});

const createUseRoutePendingTestContext = (pathname: string): UseRoutePendingTestContext => {
  const scope = new ApplicationScope();

  scope.activate(TestUseRoutePendingOwner);
  scope.get(RouterServiceControllerInterface).syncLocation({
    hash: '',
    key: 'current',
    params: {},
    pathname,
    search: '',
    state: null,
  });

  return {
    wrapper: ({ children }) => {
      return <RuntimeScopeProvider scope={scope}>{children}</RuntimeScopeProvider>;
    },
  };
};

interface UseRoutePendingTestContext {
  readonly wrapper: React.FC<React.PropsWithChildren>;
}

const mockNavigation = (state: 'idle' | 'loading' | 'submitting', pathname?: string): void => {
  routerMocks.useNavigation.mockReturnValue({
    formAction: undefined,
    formData: undefined,
    formEncType: undefined,
    formMethod: undefined,
    json: undefined,
    location:
      pathname === undefined
        ? undefined
        : {
            hash: '',
            key: 'next',
            pathname,
            search: '',
            state: null,
          },
    state,
    text: undefined,
  });
};

const mockHref = (href: string): void => {
  routerMocks.useHref.mockReturnValue(href);
};

class TestUseRoutePendingBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    const bindings = new RouterServiceBindings();

    bindings.register(registry);
  }
}

@Injectable()
@UseBindings(TestUseRoutePendingBindings)
class TestUseRoutePendingOwner {}
