import React from 'react';

import { isHttpException } from '../../../../core/http/exception/http-exception';
import type { RouteDeclaration } from '../../../../core/router/declaration/route';
import type { RouterDeclaration } from '../../../../core/router/declaration/router';
import type { RouteRuntimeSnapshot } from '../../../../core/router/runtime/route-runtime';
import type { RouterRuntimeSnapshot } from '../../../../core/router/runtime/router-runtime';

interface BoundaryComponents {
  readonly forbidden?: React.ReactNode;
  readonly notFound?: React.ReactNode;
}

interface RoutePresentationSource {
  readonly route: RouteDeclaration;
  getSnapshot(): RouteRuntimeSnapshot;
  subscribe(listener: () => void): () => void;
}

interface RouterPresentationSource {
  readonly router: RouterDeclaration;
  getSnapshot(): RouterRuntimeSnapshot;
  getBranchSnapshot(): {
    readonly routes: readonly RoutePresentationSource[];
    readonly pendingLocalChange?: { readonly commonRouteCount: number } | null;
  };
  subscribe(listener: () => void): () => void;
}

interface PresentationBindings {
  readonly getRouteComponents: (route: RouteDeclaration) => BoundaryComponents;
  readonly getRouterComponents: (router: RouterDeclaration) => BoundaryComponents;
}

interface RoutingPresentationProps extends React.PropsWithChildren {
  readonly components: BoundaryComponents;
  readonly decision?: { readonly type: 'forbidden' | 'not-found' } | null;
  readonly pending?: boolean;
  readonly routes?: readonly RoutePresentationSource[];
  readonly runtime: RouterPresentationSource | null;
  readonly snapshot?: RouterRuntimeSnapshot;
}

interface BoundaryPresentationProps extends React.PropsWithChildren {
  readonly components: BoundaryComponents;
  readonly phase: RouteRuntimeSnapshot['phase'];
}

type HandledStatus = 403 | 404 | null;

const resolveStatus = (phase: string, components: BoundaryComponents): HandledStatus => {
  if (phase === 'forbidden' && components.forbidden !== null && components.forbidden !== undefined) return 403;
  if (phase === 'not-found' && components.notFound !== null && components.notFound !== undefined) return 404;
  return null;
};

// Each renderer owns its context. This projection never changes runtime outcomes or component lookup.
export const createHandledRoutingErrorPresentation = (bindings: PresentationBindings) => {
  const Context = React.createContext<HandledStatus>(null);

  const resolveRouterStatus = (props: RoutingPresentationProps): HandledStatus => {
    if (!props.runtime) return null;
    const snapshot = props.snapshot ?? props.runtime.getSnapshot();
    const router = bindings.getRouterComponents(props.runtime.router);
    let components: BoundaryComponents = {
      forbidden: router.forbidden ?? props.components.forbidden,
      notFound: router.notFound ?? props.components.notFound,
    };
    const phase = props.decision?.type ?? snapshot.phase;
    if (phase === 'forbidden' || phase === 'not-found') return resolveStatus(phase, components);
    if (phase === 'failed' || props.pending) return null;

    const branch = props.runtime.getBranchSnapshot();
    const routes = props.routes ?? branch.routes;
    const pendingAfter = props.routes ? null : branch.pendingLocalChange?.commonRouteCount;
    for (let index = 0; index < routes.length; index++) {
      if (index === pendingAfter) return null;
      const route = routes[index]!;
      const definition = bindings.getRouteComponents(route.route);
      components = {
        forbidden: definition.forbidden ?? components.forbidden,
        notFound: definition.notFound ?? components.notFound,
      };
      const routePhase = route.getSnapshot().phase;
      if (routePhase === 'forbidden' || routePhase === 'not-found') return resolveStatus(routePhase, components);
      if (routePhase !== 'active' && routePhase !== 'retained') return null;
    }
    return null;
  };

  const RoutingErrorPresentation: React.FC<RoutingPresentationProps> = (props) => {
    const subscribe = React.useCallback(
      (listener: () => void) => {
        const runtime = props.runtime;
        if (!runtime) return () => undefined;
        let unsubscribeRoutes: Array<() => void> = [];
        const bindRoutes = () => {
          unsubscribeRoutes.forEach((unsubscribe) => unsubscribe());
          unsubscribeRoutes = (props.routes ?? runtime.getBranchSnapshot().routes).map((route) =>
            route.subscribe(listener),
          );
        };
        bindRoutes();
        const unsubscribeRouter = runtime.subscribe(() => {
          bindRoutes();
          listener();
        });
        return () => {
          unsubscribeRouter();
          unsubscribeRoutes.forEach((unsubscribe) => unsubscribe());
        };
      },
      [props.runtime, props.routes],
    );
    const getSnapshot = React.useCallback(() => resolveRouterStatus(props), [props]);
    const status = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return <Context.Provider value={status}>{props.children}</Context.Provider>;
  };

  const HandledRoutingErrorBoundary: React.FC<BoundaryPresentationProps> = (props) => {
    const inherited = React.useContext(Context);
    const status = resolveStatus(props.phase, props.components) ?? inherited;
    return <Context.Provider value={status}>{props.children}</Context.Provider>;
  };

  const useIsRoutingErrorHandled = (): ((error: unknown) => boolean) => {
    const status = React.useContext(Context);
    return React.useCallback(
      (error: unknown) => status !== null && isHttpException(error) && error.status === status,
      [status],
    );
  };

  return { RoutingErrorPresentation, HandledRoutingErrorBoundary, useIsRoutingErrorHandled };
};
