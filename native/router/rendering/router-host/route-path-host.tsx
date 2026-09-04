import React from 'react';

import type { RouteActivationRuntime } from '../../../../core/router/runtime/route-runtime';
import type { ApplicationComponents } from '../../../application/config/application-configurator';
import type { ModuleMetadata } from '../../../module/declaration/module';
import type { ModulePresentationMode } from '../../../module/rendering/module-host';
import { getRoutePresentationDefinition } from '../../declaration/route';
import { RouteHost, RouteModuleHost } from '../route-host';

const routeRuntimeKeys = new WeakMap<RouteActivationRuntime<ModuleMetadata>, string>();
let routeRuntimeKey = 0;

interface RoutePathHostProps {
  readonly components: ApplicationComponents;
  readonly endIndex?: number;
  readonly outlet?: (components: ApplicationComponents) => React.ReactNode;
  readonly pendingAfterRouteCount?: number | null;
  readonly presentation: ModulePresentationMode;
  readonly routes: readonly RouteActivationRuntime<ModuleMetadata>[];
  readonly startIndex?: number;
}

export const RoutePathHost: React.FC<RoutePathHostProps> = (props) => {
  return renderRoutePath(
    props.components,
    props.routes,
    props.pendingAfterRouteCount ?? null,
    props.presentation,
    props.startIndex ?? 0,
    props.endIndex ?? props.routes.length,
    props.outlet,
  );
};

const renderRoutePath = (
  inheritedComponents: ApplicationComponents,
  routes: readonly RouteActivationRuntime<ModuleMetadata>[],
  pendingAfterRouteCount: number | null,
  presentation: ModulePresentationMode,
  index: number,
  endIndex: number,
  outlet: RoutePathHostProps['outlet'],
): React.ReactNode => {
  if (pendingAfterRouteCount === index) return inheritedComponents.fallback ?? null;
  if (index >= endIndex) return outlet?.(inheritedComponents) ?? null;

  const runtime = routes[index];

  if (!runtime) return outlet?.(inheritedComponents) ?? null;

  const definition = getRoutePresentationDefinition(runtime.route);
  const components: ApplicationComponents = {
    exception: definition.exception ?? inheritedComponents.exception,
    fallback: definition.fallback ?? inheritedComponents.fallback,
    forbidden: definition.forbidden ?? inheritedComponents.forbidden,
    notFound: definition.notFound ?? inheritedComponents.notFound,
  };

  const child =
    index + 1 >= endIndex ? (
      outlet ? (
        outlet(components)
      ) : (
        <RouteModuleHost components={components} presentation={presentation} runtime={runtime} />
      )
    ) : (
      renderRoutePath(components, routes, pendingAfterRouteCount, presentation, index + 1, endIndex, outlet)
    );

  return (
    <RouteHost
      key={getRouteRuntimeKey(runtime)}
      components={components}
      layouts={definition.layouts}
      presentation={presentation}
      runtime={runtime}
    >
      {child}
    </RouteHost>
  );
};

const getRouteRuntimeKey = (runtime: RouteActivationRuntime<ModuleMetadata>): string => {
  const current = routeRuntimeKeys.get(runtime);

  if (current) return current;

  const key = `native-route-runtime-${++routeRuntimeKey}`;

  routeRuntimeKeys.set(runtime, key);
  return key;
};
