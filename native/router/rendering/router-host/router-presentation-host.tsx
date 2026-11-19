import React from 'react';
import type { LayoutContentKind } from '../../../../shared/layout/declaration/layout-content-kind';

import type { ApplicationNavigationDecision } from '../../../../core/application/lifecycle/application';
import { requireRuntimeException } from '../../../../core/runtime/exception/runtime-exception';
import type { RouterRuntime, RouterRuntimeSnapshot } from '../../../../core/router/runtime/router-runtime';
import type { ApplicationComponents } from '../../../application/config/application-configurator';
import { renderLayouts } from '../../../layout/rendering/layout-renderer';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { ExceptionProvider } from '../../../runtime/exception/exception-context';
import { RuntimeErrorBoundary } from '../../../runtime/exception/runtime-error-boundary';
import { getRouterPresentationDefinition } from '../../declaration/router';
import { RoutingErrorPresentation } from '../handled-routing-error';
import type { RouteActivationRuntime } from '../../../../core/router/runtime/route-runtime';

export interface RouterPresentationContext {
  readonly components: ApplicationComponents;
}

interface RouterPresentationHostProps {
  readonly children: (context: RouterPresentationContext) => React.ReactNode;
  readonly components: ApplicationComponents;
  readonly kind: LayoutContentKind;
  readonly decision?: ApplicationNavigationDecision | null;
  readonly runtime: RouterRuntime<ModuleMetadata>;
  readonly snapshot?: RouterRuntimeSnapshot;
  readonly routes?: readonly RouteActivationRuntime<ModuleMetadata>[];
  readonly pending?: boolean;
}

export const RouterPresentationHost: React.FC<RouterPresentationHostProps> = (props) => {
  const runtimeSnapshot = React.useSyncExternalStore(
    React.useCallback((listener) => props.runtime.subscribe(listener), [props.runtime]),
    React.useCallback(() => props.runtime.getSnapshot(), [props.runtime]),
    React.useCallback(() => props.runtime.getSnapshot(), [props.runtime]),
  );
  const snapshot = props.snapshot ?? runtimeSnapshot;
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
      resolveException={(error) => props.runtime.createRenderException(error)}
      resetKeys={[props.runtime]}
    >
      <RoutingErrorPresentation
        components={props.components}
        decision={props.decision}
        runtime={props.runtime}
        snapshot={props.snapshot}
        routes={props.routes}
        pending={props.pending}
      >
        {renderLayouts(definition.layouts, resolveContent(props, components, snapshot), props.kind)}
      </RoutingErrorPresentation>
    </RuntimeErrorBoundary>
  );
};

const resolveContent = (
  props: RouterPresentationHostProps,
  components: ApplicationComponents,
  snapshot: RouterRuntimeSnapshot,
): React.ReactNode => {
  const decision = props.decision?.type;

  if (decision === 'forbidden' || snapshot.phase === 'forbidden') return components.forbidden ?? null;
  if (decision === 'not-found' || snapshot.phase === 'not-found') return components.notFound ?? null;

  if (snapshot.phase === 'failed') {
    return (
      <ExceptionProvider exception={requireRuntimeException(snapshot.exception)}>
        {components.exception ?? null}
      </ExceptionProvider>
    );
  }

  return props.children({ components });
};
