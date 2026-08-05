import React from 'react';

import { ControllerRuntimeProvider } from '../../../controller/react/controller-runtime-context';
import { RevalidateBridge } from '../../../revalidate/react/revalidate-bridge';
import { renderView } from '../../view/renderable-view';
import { RuntimeScopeProvider } from '../../../runtime/react';
import type { ModuleRuntime } from '../../../module/runtime/module-runtime';

export interface LazyModuleViewProps {
  readonly moduleRuntime: ModuleRuntime;
}

export const LazyModuleView: React.FC<LazyModuleViewProps> = ({ moduleRuntime }) => {
  const activeModule = moduleRuntime.getViewModuleOrNull();

  if (activeModule === null) {
    return null;
  }

  return (
    <RevalidateBridge
      controllerTokens={[...activeModule.controllers.keys()]}
      revalidate={(controllerToken) => moduleRuntime.revalidate({ controllerToken })}
    >
      <RuntimeScopeProvider scope={activeModule.scope}>
        <ControllerRuntimeProvider
          value={{
            controllers: activeModule.controllers,
            kind: 'module',
            runtime: moduleRuntime,
          }}
        >
          {renderView(activeModule.metadata.view, {})}
        </ControllerRuntimeProvider>
      </RuntimeScopeProvider>
    </RevalidateBridge>
  );
};
