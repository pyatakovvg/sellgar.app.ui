import React from 'react';
import {
  createBrowserRouter,
  matchRoutes,
  Outlet,
  useLocation,
  useMatches,
  type LoaderFunction,
  type RouteObject,
} from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { ApplicationComponentsProvider } from '../../../application/react/application-components-context';
import { FrameLayer } from '../../../frame/react/frame-layer';
import { renderLayouts } from '../../../layout/rendering/layout-renderer';
import type { LayoutConstructor } from '../../../layout/declaration/layout';
import type { ApplicationFeatureInterface } from '../../../application/feature/application-feature';
import type {
  ApplicationComponents,
  ResolvedApplicationFrames,
} from '../../../application/config/application-configurator';
import type { ApplicationControllerInterface } from '../../../application/lifecycle/application-lifecycle';
import type { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import { NavigationBlockerBridge } from '../../../features/navigation-blocker/react/navigation-blocker-bridge';
import { NavigationBlockerRuntimeInterface } from '../../../features/navigation-blocker/runtime/navigation-blocker-runtime';
import { RevalidateBridge } from '../../../revalidate/react/revalidate-bridge';
import { getRouterDefinition, type Router } from '../../../router/declaration/router';
import { RouterRuntime } from '../../../router/runtime/router-runtime';
import { RouterServiceControllerInterface } from '../../../router/service/router-service-controller';
import { NavigateServiceInterface } from '../../../router/service/navigate-service';
import { RuntimeScopeProvider } from '../../../runtime/react';
import { RuntimeOperationCoordinator } from '../../../runtime/operation';
import type { ApplicationScope } from '../../../runtime/scope/kind';

import { RouteExceptionBoundary } from '../exception';

import {
  createEmptyRoutePolicies,
  createRouteObjects,
  createRouteRuntimeLoadContext,
} from './route-object-builder.tsx';

export const createReactRouterView = (
  router: Router,
  components: ApplicationComponents,
  layouts: LayoutConstructor[],
  features: readonly ApplicationFeatureInterface[],
  frames: ResolvedApplicationFrames | null,
  app: ApplicationControllerInterface,
  session: SessionRuntimeStateInterface,
  routerRuntime: RouterRuntime,
  applicationScope: ApplicationScope,
): React.FC => {
  const definition = getRouterDefinition(router);
  const routerService = applicationScope.get(RouterServiceControllerInterface);
  const operationCoordinator = applicationScope.get(RuntimeOperationCoordinator);
  const navigateService = applicationScope.get(NavigateServiceInterface);
  const navigationBlockerRuntime = applicationScope.has(NavigationBlockerRuntimeInterface)
    ? applicationScope.get(NavigationBlockerRuntimeInterface)
    : null;
  const basePath = definition.baseUrl?.replace(/\/$/, '');
  const routeObjects = createRouteObjects({
    app,
    applicationScope,
    appendNotFoundRoute: true,
    basePath,
    components,
    inheritedException: components.exception,
    inheritedFallback: components.fallback,
    inheritedForbidden: components.forbidden,
    inheritedNotFound: components.notFound,
    inheritedPolicies: createEmptyRoutePolicies(),
    parentKey: 'root',
    routerRuntime,
    routes: definition.routes,
    session,
  });
  const preloadFrame = createFramePreloadLoader({
    app,
    basePath,
    navigateService,
    routeObjects,
    routerRuntime,
    session,
  });
  let browserRouter: ReturnType<typeof createBrowserRouter>;

  connectRuntimeRefresh(operationCoordinator, routerRuntime, () => browserRouter.revalidate());
  browserRouter = createBrowserRouter(
    [
      {
        path: '/',
        element: renderLayouts(
          layouts,
          <RouterServiceLocationBoundary routerService={routerService}>
            {navigationBlockerRuntime && (
              <NavigationBlockerBridge
                basePath={basePath}
                routeObjects={routeObjects}
                routerRuntime={routerRuntime}
                runtime={navigationBlockerRuntime}
              />
            )}
            <RevalidateBridge fallback revalidate={() => operationCoordinator.invalidateAndWait()}>
              <ActiveRouteRuntimeBoundary routerRuntime={routerRuntime}>
                <Outlet />
                <RouteFrameLayer app={app} configuration={frames} routerRuntime={routerRuntime} />
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
        loader: preloadFrame,
        shouldRevalidate: ({ currentUrl, nextUrl }) => !isHashOnlyNavigation(currentUrl, nextUrl),
        children: routeObjects,
      },
    ],
    {
      basename: basePath,
    },
  );
  return () => {
    React.useEffect(() => {
      return routerService.attachNavigator({
        back: () => {
          return browserRouter.navigate(-1);
        },
        navigate: (to, options) => {
          return browserRouter.navigate(to, options);
        },
      });
    }, []);

    return (
      <ApplicationComponentsProvider components={components}>
        <RuntimeScopeProvider scope={applicationScope}>
          <RouterProvider router={browserRouter} />
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
  readonly configuration: ResolvedApplicationFrames | null;
  readonly routerRuntime: RouterRuntime;
}

const RouteFrameLayer: React.FC<RouteFrameLayerProps> = ({ app, configuration, routerRuntime }) => {
  const matches = useMatches();

  return (
    <FrameLayer
      app={app}
      configuration={configuration}
      routeIds={matches.map((match) => match.id)}
      routerRuntime={routerRuntime}
    />
  );
};

interface FramePreloadLoaderOptions {
  readonly app: ApplicationControllerInterface;
  readonly basePath?: string;
  readonly navigateService: NavigateServiceInterface;
  readonly routeObjects: RouteObject[];
  readonly routerRuntime: RouterRuntime;
  readonly session: SessionRuntimeStateInterface;
}

export const createFramePreloadLoader = (options: FramePreloadLoaderOptions): LoaderFunction => {
  return async (args) => {
    const context = createRouteRuntimeLoadContext(args, options.basePath);
    const matches = matchRoutes(options.routeObjects, context.location.pathname);
    const routeIds = matches?.flatMap((match) => (typeof match.route.id === 'string' ? [match.route.id] : [])) ?? [];
    const params =
      matches?.reduce<Record<string, string | undefined>>((result, match) => {
        Object.assign(result, match.params);
        return result;
      }, {}) ?? context.location.params;

    await options.routerRuntime.preloadFrame(routeIds, context.location.hash, {
      app: options.app,
      location: {
        ...context.location,
        params,
      },
      navigateService: options.navigateService,
      session: options.session,
      signal: args.request.signal,
    });

    return null;
  };
};

const isHashOnlyNavigation = (currentUrl: URL, nextUrl: URL): boolean => {
  return (
    currentUrl.pathname === nextUrl.pathname && currentUrl.search === nextUrl.search && currentUrl.hash !== nextUrl.hash
  );
};

export const connectRuntimeRefresh = (
  coordinator: RuntimeOperationCoordinator,
  routerRuntime: RouterRuntime,
  revalidate: () => void | Promise<void>,
): (() => void) => {
  return coordinator.attachRefresh(() => {
    routerRuntime.invalidateActiveRoutes();
    return revalidate();
  });
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
