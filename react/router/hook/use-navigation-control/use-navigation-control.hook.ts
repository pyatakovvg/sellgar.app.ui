import type { NavigationRequestFactory } from '../../../../core/router/service/navigation-request';
import { createNavigationRequest } from '../../../../core/router/service/navigation-request';
import {
  resolveNavigationControlState,
  resolveNavigationRouteState,
} from '../../../../core/router/runtime/navigation-state';
import type { NavigationState } from '../../../../core/router/runtime/navigation-state';
import { executeNavigateRequest, resolveNavigateRequest } from '../../../../core/router/service/navigate-service';
import { useNavigationState } from '../../runtime/navigation-state-context';
import { useNavigate } from '../use-navigate';

export interface NavigationControl {
  readonly execute: () => Promise<void>;
  readonly isActive: boolean;
  readonly isPending: boolean;
  readonly target: NavigationState;
}

export const useNavigationControl = (
  factory: NavigationRequestFactory,
  end: boolean,
  viewTransition = false,
): NavigationControl => {
  const navigate = useNavigate();
  const navigation = useNavigationState();
  const request = createNavigationRequest(factory);
  const target = resolveNavigateRequest(navigate, request);
  const targetState = resolveNavigationControlState(
    navigation.snapshot.navigation,
    navigation.snapshot.pending,
    target,
    { end },
  );
  const routeState = resolveNavigationRouteState(
    navigation.snapshot.navigation,
    navigation.snapshot.pending,
    request.token,
    {
      end,
      params: request.options.params,
    },
  );

  return {
    execute: () => executeNavigationControl(() => executeNavigateRequest(navigate, request), viewTransition),
    isActive: routeState.isActive,
    isPending: targetState.isPending,
    target,
  };
};

export const executeNavigationControl = async (
  execute: () => Promise<void>,
  viewTransition: boolean,
): Promise<void> => {
  if (!viewTransition || typeof document === 'undefined' || typeof document.startViewTransition !== 'function') {
    await execute();
    return;
  }

  const transition = document.startViewTransition(execute);

  await transition.updateCallbackDone;
};
