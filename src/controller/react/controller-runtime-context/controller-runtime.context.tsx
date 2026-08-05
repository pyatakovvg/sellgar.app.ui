import React from 'react';

import type { DependencyToken } from '../../../di/token/dependency-token';
import type { FrameRuntime } from '../../../frame/runtime/frame-runtime';
import type { ModuleRuntime } from '../../../module/runtime/module-runtime';
import type { WidgetRuntime } from '../../../widget/runtime/widget-runtime';

export type ControllerRuntimeRegistry = ReadonlyMap<DependencyToken<unknown>, unknown>;

export type ControllerRuntimeContextValue =
  | {
      readonly controllers: ControllerRuntimeRegistry;
      readonly kind: 'module';
      readonly runtime: ModuleRuntime;
    }
  | {
      readonly controllers: ControllerRuntimeRegistry;
      readonly kind: 'frame';
      readonly runtime: FrameRuntime<any>;
    }
  | {
      readonly controllers: ControllerRuntimeRegistry;
      readonly kind: 'widget';
      readonly runtime: WidgetRuntime<any>;
    };

const ControllerRuntimeContext = React.createContext<ControllerRuntimeContextValue | null>(null);

export interface ControllerRuntimeProviderProps {
  readonly children: React.ReactNode;
  readonly value: ControllerRuntimeContextValue;
}

export const ControllerRuntimeProvider: React.FC<ControllerRuntimeProviderProps> = ({ children, value }) => {
  return <ControllerRuntimeContext.Provider value={value}>{children}</ControllerRuntimeContext.Provider>;
};

export const useControllerRuntime = (): ControllerRuntimeContextValue => {
  const runtime = React.useContext(ControllerRuntimeContext);

  if (runtime === null) {
    throw new Error('Runtime controllers недоступны.');
  }

  return runtime;
};

export const useController = <TController,>(controllerToken: DependencyToken<TController>): TController => {
  const runtime = useControllerRuntime();

  const controller = runtime.controllers.get(controllerToken);

  if (controller === undefined) {
    throw new Error('Controller недоступен в текущем runtime entity.');
  }

  return controller as TController;
};
