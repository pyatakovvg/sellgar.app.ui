import React from 'react';

import type { ApplicationNavigationDecision } from '../../../../core/application/lifecycle/application';
import type { RouterRuntime, RouterRuntimeSnapshot } from '../../../../core/router/runtime/router-runtime';
import type { ApplicationComponents } from '../../../application/config/application-configurator';
import { renderLayouts } from '../../../layout/rendering/layout-renderer';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { ExceptionProvider } from '../../../runtime/exception/exception-context';
import { RuntimeErrorBoundary } from '../../../runtime/exception/runtime-error-boundary';
import { getRouterPresentationDefinition } from '../../declaration/router';

export interface RouterPresentationContext {
  readonly components: ApplicationComponents;
}

interface RouterPresentationHostProps {
  readonly children: (context: RouterPresentationContext) => React.ReactNode;
  readonly components: ApplicationComponents;
  readonly decision?: ApplicationNavigationDecision | null;
  readonly runtime: RouterRuntime<ModuleMetadata>;
  readonly snapshot?: RouterRuntimeSnapshot;
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
      resetKeys={[props.runtime]}
    >
      {renderLayouts(definition.layouts, resolveContent(props, components, snapshot))}
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
    return <ExceptionProvider error={snapshot.error}>{components.exception ?? null}</ExceptionProvider>;
  }

  return props.children({ components });
};
