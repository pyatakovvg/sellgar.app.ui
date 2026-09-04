import React from 'react';

import type { ModuleRuntime } from '../../../../core/module/runtime/module-runtime';
import type { RouteActivationRuntime } from '../../../../core/router/runtime/route-runtime';
import { ControllerRuntimeProvider } from '../../../controller/runtime/controller-runtime-context';
import { renderLayouts } from '../../../layout/rendering/layout-renderer';
import { ExceptionProvider } from '../../../runtime/exception/exception-context';
import { RuntimeErrorBoundary } from '../../../runtime/exception/runtime-error-boundary';
import { RuntimeScopeProvider } from '../../../runtime/scope/runtime-scope-context';
import { renderView } from '../../../view/renderable-view';
import type { ModuleMetadata } from '../../declaration/module';
import { ModuleRefreshPresentation } from './module-refresh-presentation.tsx';

export type ModulePresentationMode = 'frame' | 'screen';

interface IProps {
  readonly exception: React.ReactNode;
  readonly fallback: React.ReactNode;
  readonly moduleRuntime: ModuleRuntime<ModuleMetadata>;
  readonly presentation: ModulePresentationMode;
  readonly routeRuntime: RouteActivationRuntime<ModuleMetadata>;
}

export const ModuleHost: React.FC<IProps> = (props) => {
  const moduleSnapshot = React.useSyncExternalStore(
    React.useCallback((listener) => props.moduleRuntime.subscribe(listener), [props.moduleRuntime]),
    React.useCallback(() => props.moduleRuntime.getSnapshot(), [props.moduleRuntime]),
    React.useCallback(() => props.moduleRuntime.getSnapshot(), [props.moduleRuntime]),
  );
  const boundaryModule = props.routeRuntime.getBoundaryModuleOrNull();
  const presentationModule = props.routeRuntime.getPresentationModuleOrNull();

  if (moduleSnapshot.phase === 'failed') {
    return (
      <ExceptionProvider error={moduleSnapshot.error}>
        {boundaryModule?.definition.presentation.exception ?? props.exception}
      </ExceptionProvider>
    );
  }

  if (presentationModule === null) {
    return boundaryModule?.definition.presentation.fallback ?? props.fallback;
  }

  const metadata = presentationModule.definition.presentation;
  const view = renderView(metadata.view, {});
  const content =
    props.presentation === 'screen' ? (
      <ModuleRefreshPresentation runtime={props.routeRuntime}>{view}</ModuleRefreshPresentation>
    ) : (
      view
    );

  return (
    <RuntimeErrorBoundary
      exception={metadata.exception ?? props.exception}
      onError={(error) => void props.moduleRuntime.failRender(error)}
      resetKeys={[props.moduleRuntime]}
    >
      <RuntimeScopeProvider scope={presentationModule.scope}>
        <ControllerRuntimeProvider value={props.routeRuntime}>
          {renderLayouts(metadata.layouts ?? [], content)}
        </ControllerRuntimeProvider>
      </RuntimeScopeProvider>
    </RuntimeErrorBoundary>
  );
};
