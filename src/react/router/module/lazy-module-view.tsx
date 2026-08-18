import React from 'react';

import { ControllerRuntimeProvider } from '../../../controller/react/controller-runtime-context';
import { RevalidateBridge } from '../../../revalidate/react/revalidate-bridge';
import { renderView } from '../../view/renderable-view';
import { RuntimeScopeProvider } from '../../../runtime/react';
import type { ModuleRuntime } from '../../../module/runtime/module-runtime';
import type { ControllerRuntimeContextValue } from '../../../controller/react/controller-runtime-context';

export interface LazyModuleViewProps {
  readonly moduleRuntime: ModuleRuntime;
  readonly routeRuntime: ControllerRuntimeContextValue;
}

export const LazyModuleView: React.FC<LazyModuleViewProps> = ({ moduleRuntime, routeRuntime }) => {
  const snapshot = React.useSyncExternalStore(
    React.useCallback((onStoreChange) => moduleRuntime.subscribe(onStoreChange), [moduleRuntime]),
    React.useCallback(() => moduleRuntime.getSnapshot(), [moduleRuntime]),
    React.useCallback(() => moduleRuntime.getSnapshot(), [moduleRuntime]),
  );

  if (snapshot.phase === 'failed') {
    throw snapshot.error;
  }

  const activeModule = moduleRuntime.getViewModuleOrNull();

  if (activeModule === null) {
    return null;
  }

  return (
    <RevalidateBridge
      controllerTokens={[...activeModule.controllers.keys()]}
      revalidate={(controllerToken) => routeRuntime.revalidate({ controllerToken })}
    >
      <RuntimeScopeProvider scope={activeModule.scope}>
        <ControllerRuntimeProvider value={routeRuntime}>
          {renderView(activeModule.metadata.view, {})}
        </ControllerRuntimeProvider>
      </RuntimeScopeProvider>
    </RevalidateBridge>
  );
};
