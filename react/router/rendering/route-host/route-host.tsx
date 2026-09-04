import React from 'react';

import type { RouteActivationRuntime } from '../../../../core/router/runtime/route-runtime';
import type { ApplicationComponents } from '../../../application/config/application-configurator';
import { renderLayouts } from '../../../layout/rendering/layout-renderer';
import type { LayoutConstructor } from '../../../layout/declaration/layout';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { ModuleHost } from '../../../module/rendering/module-host';
import { ExceptionProvider } from '../../../runtime/exception/exception-context';
import { RuntimeScopeProvider } from '../../../runtime/scope/runtime-scope-context';
import { RuntimeErrorBoundary } from '../../../runtime/exception/runtime-error-boundary';

interface IProps {
  readonly children: React.ReactNode;
  readonly components: ApplicationComponents;
  readonly layouts: readonly LayoutConstructor[];
  readonly runtime: RouteActivationRuntime<ModuleMetadata>;
}

export const RouteHost: React.FC<IProps> = (props) => {
  const snapshot = React.useSyncExternalStore(
    React.useCallback((listener) => props.runtime.subscribe(listener), [props.runtime]),
    React.useCallback(() => props.runtime.getSnapshot(), [props.runtime]),
    React.useCallback(() => props.runtime.getSnapshot(), [props.runtime]),
  );

  const content = resolveRouteContent(props, snapshot);

  return (
    <RuntimeErrorBoundary
      exception={props.components.exception}
      onError={(error) => void props.runtime.failRender(error)}
      resetKeys={[props.runtime]}
    >
      <RuntimeScopeProvider scope={props.runtime.getRouteScope()}>
        {renderLayouts(props.layouts, content)}
      </RuntimeScopeProvider>
    </RuntimeErrorBoundary>
  );
};

const resolveRouteContent = (
  props: IProps,
  snapshot: ReturnType<RouteActivationRuntime<ModuleMetadata>['getSnapshot']>,
): React.ReactNode => {
  if (snapshot.phase === 'forbidden') {
    return props.components.forbidden ?? null;
  }

  if (snapshot.phase === 'not-found') {
    return props.components.notFound ?? null;
  }

  if (snapshot.phase === 'failed') {
    return <ExceptionProvider error={snapshot.error}>{props.components.exception ?? null}</ExceptionProvider>;
  }

  if (snapshot.phase !== 'active') {
    return props.components.fallback ?? null;
  }

  const moduleRuntime = props.children === null ? props.runtime.getModuleRuntimeOrNull() : null;

  return (
    <>
      {moduleRuntime ? (
        <ModuleHost
          exception={props.components.exception}
          fallback={props.components.fallback}
          moduleRuntime={moduleRuntime}
          routeRuntime={props.runtime}
        />
      ) : null}
      {props.children}
    </>
  );
};
