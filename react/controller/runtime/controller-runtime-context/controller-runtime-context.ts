import React from 'react';

import type { DependencyToken } from '../../../../core/di/token/dependency-token';
import type {
  ModuleRuntimeActionState,
  ModuleRuntimeRevalidateState,
} from '../../../../core/module/runtime/module-runtime';
import type { RouteRuntimeRevalidateOptions } from '../../../../core/router/runtime/route-runtime';

export interface ControllerRuntimeContextValue {
  action<TPayload>(controllerToken: DependencyToken<unknown>, payload: TPayload): Promise<unknown>;
  getActionState<TResult = unknown>(controllerToken: DependencyToken<unknown>): ModuleRuntimeActionState<TResult>;
  getController<TController>(controllerToken: DependencyToken<TController>): TController;
  getLoaderData<TValue>(controllerToken: DependencyToken<unknown>): TValue;
  getParams(): Readonly<Record<string, unknown>>;
  getRevalidateRevision(): number;
  getRevalidateState(controllerToken?: DependencyToken<unknown>): ModuleRuntimeRevalidateState;
  invoke<TValue>(controllerToken: DependencyToken<unknown>, method: string | symbol, args: readonly unknown[]): TValue;
  revalidate(options?: RouteRuntimeRevalidateOptions): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export const ControllerRuntimeContext = React.createContext<ControllerRuntimeContextValue | null>(null);
