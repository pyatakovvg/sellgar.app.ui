import React from 'react';

import type { ApplicationNavigationDecision } from '../../../../core/application/lifecycle/application';
import type { RouteActivationRuntime } from '../../../../core/router/runtime/route-runtime';
import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';
import type { ApplicationComponents } from '../../../application/config/application-configurator';
import { renderLayouts } from '../../../layout/rendering/layout-renderer';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { ExceptionProvider } from '../../../runtime/exception/exception-context';
import { RuntimeErrorBoundary } from '../../../runtime/exception/runtime-error-boundary';
import { getRoutePresentationDefinition } from '../../declaration/route';
import { getRouterPresentationDefinition } from '../../declaration/router';
import { RouteHost } from '../route-host';

const routeRuntimeKeys = new WeakMap<RouteActivationRuntime<ModuleMetadata>, string>();
let routeRuntimeKey = 0;

interface IProps {
  readonly components: ApplicationComponents;
  readonly decision?: ApplicationNavigationDecision | null;
  readonly pending?: boolean;
  readonly runtime: RouterRuntime<ModuleMetadata>;
}

export const RouterHost: React.FC<IProps> = (props) => {
  const snapshot = React.useSyncExternalStore(
    React.useCallback((listener) => props.runtime.subscribe(listener), [props.runtime]),
    React.useCallback(() => props.runtime.getSnapshot(), [props.runtime]),
    React.useCallback(() => props.runtime.getSnapshot(), [props.runtime]),
  );
  const definition = getRouterPresentationDefinition(props.runtime.router);
  const components: ApplicationComponents = {
    exception: definition.exception ?? props.components.exception,
    fallback: definition.fallback ?? props.components.fallback,
    forbidden: definition.forbidden ?? props.components.forbidden,
    notFound: definition.notFound ?? props.components.notFound,
  };

  return (
    <RuntimeErrorBoundary
      exception={components.exception}
      onError={(error) => void props.runtime.failRender(error)}
      resetKeys={[props.runtime]}
    >
      {renderLayouts(definition.layouts, renderRouterContent(props, components, snapshot))}
    </RuntimeErrorBoundary>
  );
};

const renderRouterContent = (
  props: IProps,
  components: ApplicationComponents,
  snapshot: ReturnType<RouterRuntime<ModuleMetadata>['getSnapshot']>,
): React.ReactNode => {
  const decision = props.decision?.type;

  if (decision === 'forbidden' || snapshot.phase === 'forbidden') {
    return components.forbidden ?? null;
  }

  if (decision === 'not-found' || snapshot.phase === 'not-found') {
    return components.notFound ?? null;
  }

  if (snapshot.phase === 'failed') {
    return <ExceptionProvider error={snapshot.error}>{components.exception ?? null}</ExceptionProvider>;
  }

  if (props.pending) {
    return components.fallback ?? null;
  }

  const branch = props.runtime.getBranchSnapshot();
  const routes = branch.routes;

  if (routes.length === 0) {
    return components.fallback ?? null;
  }

  return renderRoutePath(components, routes, branch.pendingLocalChange?.commonRouteCount ?? null, 0);
};

const renderRoutePath = (
  inheritedComponents: ApplicationComponents,
  routes: ReturnType<RouterRuntime<ModuleMetadata>['getBranchSnapshot']>['routes'],
  pendingAfterRouteCount: number | null,
  index: number,
): React.ReactNode => {
  if (pendingAfterRouteCount === index) {
    return inheritedComponents.fallback ?? null;
  }

  const runtime = routes[index];

  if (!runtime) {
    return null;
  }

  const definition = getRoutePresentationDefinition(runtime.route);
  const components: ApplicationComponents = {
    exception: definition.exception ?? inheritedComponents.exception,
    fallback: definition.fallback ?? inheritedComponents.fallback,
    forbidden: definition.forbidden ?? inheritedComponents.forbidden,
    notFound: definition.notFound ?? inheritedComponents.notFound,
  };
  const childRoute = renderRoutePath(components, routes, pendingAfterRouteCount, index + 1);

  return (
    <RouteHost key={getRouteRuntimeKey(runtime)} components={components} layouts={definition.layouts} runtime={runtime}>
      {childRoute}
    </RouteHost>
  );
};

const getRouteRuntimeKey = (runtime: RouteActivationRuntime<ModuleMetadata>): string => {
  const current = routeRuntimeKeys.get(runtime);

  if (current) {
    return current;
  }

  const key = `route-runtime-${++routeRuntimeKey}`;

  routeRuntimeKeys.set(runtime, key);

  return key;
};
