import type { RouteMatchOptions, RouteToken } from '../../../../core/router/declaration/route-token';
import { resolveNavigationRouteState } from '../../../../core/router/runtime/navigation-state';
import { useNavigationState } from '../../runtime/navigation-state-context';

export const useRoutePending = <TToken extends RouteToken>(
  token: TToken,
  options: RouteMatchOptions<TToken> = {},
): boolean => {
  const navigation = useNavigationState();

  return resolveNavigationRouteState(navigation.snapshot.navigation, navigation.snapshot.pending, token, options)
    .isPending;
};
