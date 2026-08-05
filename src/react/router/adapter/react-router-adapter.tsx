import React from 'react';
import { createBrowserRouter, Outlet, RouterProvider, useLocation, useMatches, useNavigation } from 'react-router-dom';

import { ApplicationComponentsProvider } from '../../../application/react/application-components-context';
import { FrameLayer } from '../../../frame/react/frame-layer';
import { renderLayouts } from '../../../layout/rendering/layout-renderer';
import type { LayoutConstructor } from '../../../layout/declaration/layout';
import type { ApplicationFeatureInterface } from '../../../application/feature/application-feature';
import type { ApplicationComponents } from '../../../application/config/application-configurator';
import type { ApplicationControllerInterface } from '../../../application/lifecycle/application-lifecycle';
import type { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import { RevalidateBridge } from '../../../revalidate/react/revalidate-bridge';
import type { Router } from '../../../router/declaration/router';
import { RouterRuntime } from '../../../router/runtime/router-runtime';
import { RouterServiceControllerInterface } from '../../../router/service/router-service-controller';
import { RuntimeScopeProvider } from '../../../runtime/react';
import type { ApplicationScope } from '../../../runtime/scope/kind';

import { RouteExceptionBoundary } from '../exception';

import { createEmptyRoutePolicies, createRouteObjects } from './route-object-builder.tsx';

export const createReactRouterView = (
  router: Router,
  components: ApplicationComponents,
  layouts: LayoutConstructor[],
  features: readonly ApplicationFeatureInterface[],
  app: ApplicationControllerInterface,
  session: SessionRuntimeStateInterface,
  routerRuntime: RouterRuntime,
  applicationScope: ApplicationScope,
): React.FC => {
  const routerService = applicationScope.get(RouterServiceControllerInterface);
  routerRuntime.setFrameNavigationScope(router.baseUrl?.replace(/\/$/, ''));
  const browserRouter = createBrowserRouter(
    [
      {
        path: '/',
        element: renderLayouts(
          layouts,
          <RouterServiceLocationBoundary routerService={routerService}>
            <RevalidateBridge fallback>
              <ActiveRouteRuntimeBoundary routerRuntime={routerRuntime}>
                <Outlet />
                <RouteFrameLayer app={app} routerRuntime={routerRuntime} />
              </ActiveRouteRuntimeBoundary>
            </RevalidateBridge>
          </RouterServiceLocationBoundary>,
        ),
        errorElement: (
          <RouteExceptionBoundary
            exception={components.exception}
            forbidden={components.forbidden}
            notFound={components.notFound}
          />
        ),
        hydrateFallbackElement: components.splash,
        children: createRouteObjects({
          app,
          applicationScope,
          appendNotFoundRoute: true,
          basePath: router.baseUrl?.replace(/\/$/, ''),
          components,
          inheritedException: components.exception,
          inheritedFallback: components.fallback,
          inheritedForbidden: components.forbidden,
          inheritedFrames: [],
          inheritedNotFound: components.notFound,
          inheritedPolicies: createEmptyRoutePolicies(),
          parentKey: 'root',
          routerRuntime,
          routes: router.routes,
          session,
        }),
      },
    ],
    {
      basename: router.baseUrl?.replace(/\/$/, ''),
    },
  );

  return () => {
    React.useEffect(() => {
      return routerService.attachNavigator({
        back: () => {
          globalThis.history.back();
        },
        navigate: (to, options) => {
          return browserRouter.navigate(to, options);
        },
      });
    }, []);

    return (
      <ApplicationComponentsProvider components={components}>
        <RuntimeScopeProvider scope={applicationScope}>
          <SessionRevalidationBoundary
            revalidate={() => browserRouter.revalidate()}
            routerRuntime={routerRuntime}
            session={session}
          >
            <RouterProvider router={browserRouter} />
          </SessionRevalidationBoundary>
          {features.map((feature, index) => {
            return <React.Fragment key={index}>{feature.createLayer()}</React.Fragment>;
          })}
        </RuntimeScopeProvider>
      </ApplicationComponentsProvider>
    );
  };
};

interface RouteFrameLayerProps {
  readonly app: ApplicationControllerInterface;
  readonly routerRuntime: RouterRuntime;
}

const RouteFrameLayer: React.FC<RouteFrameLayerProps> = ({ app, routerRuntime }) => {
  const navigation = useNavigation();

  return <FrameLayer app={app} deferIdleFrameLoad={navigation.state !== 'idle'} routerRuntime={routerRuntime} />;
};

interface SessionRevalidationBoundaryProps {
  readonly children: React.ReactNode;
  readonly revalidate: () => void;
  readonly routerRuntime: RouterRuntime;
  readonly session: SessionRuntimeStateInterface;
}

export const SessionRevalidationBoundary: React.FC<SessionRevalidationBoundaryProps> = ({
  children,
  revalidate,
  routerRuntime,
  session,
}) => {
  React.useEffect(() => {
    return session.subscribe((change) => {
      if (change.phase !== 'anonymous') {
        return;
      }

      routerRuntime.invalidateActiveRoutes();
      revalidate();
    });
  }, [revalidate, routerRuntime, session]);

  return <>{children}</>;
};

interface ActiveRouteRuntimeBoundaryProps {
  readonly children: React.ReactNode;
  readonly routerRuntime: RouterRuntime;
}

export const ActiveRouteRuntimeBoundary: React.FC<ActiveRouteRuntimeBoundaryProps> = ({ children, routerRuntime }) => {
  const matches = useMatches();

  React.useLayoutEffect(() => {
    if (matches.length === 0) {
      return;
    }

    routerRuntime.syncActiveRoutes(
      matches.map((match) => {
        return match.id;
      }),
    );
  }, [matches, routerRuntime]);

  return <>{children}</>;
};

interface RouterServiceLocationBoundaryProps {
  readonly children: React.ReactNode;
  readonly routerService: RouterServiceControllerInterface;
}

export const RouterServiceLocationBoundary: React.FC<RouterServiceLocationBoundaryProps> = ({
  children,
  routerService,
}) => {
  const location = useLocation();
  const matches = useMatches();

  React.useLayoutEffect(() => {
    routerService.syncLocation({
      hash: location.hash,
      key: location.key,
      params: matches.reduce<Record<string, string | undefined>>((params, match) => {
        Object.assign(params, match.params);
        return params;
      }, {}),
      pathname: location.pathname,
      search: location.search,
      state: location.state,
    });
  }, [location, matches, routerService]);

  return <>{children}</>;
};
