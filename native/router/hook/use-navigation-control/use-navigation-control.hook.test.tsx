import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { segments } from '../../../../core/router/declaration/address';
import { Route } from '../../../../core/router/declaration/route';
import { Router } from '../../../../core/router/declaration/router';
import {
  createNavigationRequest,
  type NavigationRequestFactory,
} from '../../../../core/router/service/navigation-request';
import {
  createCoreNavigate,
  createRouteScopedNavigate,
  resolveNavigateRequest,
} from '../../../../core/router/service/navigate-service';
import { useNavigationState } from '../../runtime/navigation-state-context';
import { useNavigate } from '../use-navigate';
import { useNavigationControl } from './use-navigation-control.hook';

vi.mock('../../runtime/navigation-state-context', () => ({ useNavigationState: vi.fn() }));
vi.mock('../use-navigate', () => ({ useNavigate: vi.fn() }));

abstract class ProductsRoute {}
abstract class BrandsRoute {}

const router = new Router({
  routes: [
    new Route({ address: segments('products'), load: async () => ({}), token: ProductsRoute }),
    new Route({ address: segments('brands'), load: async () => ({}), token: BrandsRoute }),
  ],
});
const productsRequest = createNavigationRequest((navigate) => navigate.to(ProductsRoute));
const brandsNavigation: NavigationRequestFactory = (navigate) => navigate.to(BrandsRoute);

describe('useNavigationControl', () => {
  beforeEach(() => {
    vi.mocked(useNavigate).mockReset();
    vi.mocked(useNavigationState).mockReset();
  });

  it('separates the initiating control process from route-target pending state', () => {
    let current = undefined as ReturnType<typeof resolveNavigateRequest> | undefined;
    const rootNavigate = createCoreNavigate({
      back: () => undefined,
      close: () => undefined,
      current: () => current,
      execute: () => undefined,
      router,
    });

    current = resolveNavigateRequest(rootNavigate, productsRequest);

    const pageNavigate = createRouteScopedNavigate(rootNavigate, 'products-runtime');
    const pending = resolveNavigateRequest(pageNavigate, createNavigationRequest(brandsNavigation));

    vi.mocked(useNavigate).mockReturnValue(rootNavigate);
    vi.mocked(useNavigationState).mockReturnValue({
      snapshot: {
        decision: null,
        navigation: current,
        pending,
      },
    });

    const { result } = renderHook(() => useNavigationControl(brandsNavigation, false));

    expect(result.current.isPending).toBe(false);
    expect(result.current.isRoutePending).toBe(true);
  });
});
