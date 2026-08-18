import React from 'react';

import type { DependencyToken } from '../../../di/token/dependency-token';
export interface ControllerRuntimeActionState<TResult = unknown> {
  readonly data: TResult | undefined;
  readonly error: unknown;
  readonly inProcess: boolean;
}

export interface ControllerRuntimeRevalidateState {
  readonly error: unknown;
  readonly inProcess: boolean;
}

export interface ControllerRuntimeRevalidateOptions {
  readonly controllerToken?: DependencyToken<unknown>;
  readonly signal?: AbortSignal;
}

export interface ControllerRuntimeContextValue {
  action<TPayload>(controllerToken: DependencyToken<unknown>, payload: TPayload): Promise<unknown>;
  getActionState(controllerToken: DependencyToken<unknown>): ControllerRuntimeActionState;
  getController(controllerToken: DependencyToken<unknown>): unknown;
  getLoaderData(controllerToken: DependencyToken<unknown>): unknown;
  getParams(): Readonly<Record<string, string | undefined>>;
  invoke(controllerToken: DependencyToken<unknown>, method: string | symbol, args: readonly unknown[]): unknown;
  getRevalidateState(controllerToken?: DependencyToken<unknown>): ControllerRuntimeRevalidateState;
  getRevalidateRevision(): number;
  revalidate(options?: ControllerRuntimeRevalidateOptions): Promise<void>;
  subscribe(listener: () => void): () => void;
}

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
  const controller = runtime.getController(controllerToken) as TController;

  return React.useMemo(
    () => createControllerFacade(controllerToken, controller, runtime),
    [controller, controllerToken, runtime],
  );
};

const createControllerFacade = <TController,>(
  controllerToken: DependencyToken<TController>,
  controller: TController,
  runtime: ControllerRuntimeContextValue,
): TController => {
  if ((typeof controller !== 'object' || controller === null) && typeof controller !== 'function') {
    return controller;
  }

  const methods = new Map<string | symbol, (...args: readonly unknown[]) => unknown>();

  return new Proxy(controller as object, {
    get(target, property) {
      const value = Reflect.get(target, property, target);

      if (typeof value !== 'function') {
        return value;
      }

      const cached = methods.get(property);

      if (cached) {
        return cached;
      }

      const method = (...args: readonly unknown[]): unknown => {
        return runtime.invoke(controllerToken, property, args);
      };

      methods.set(property, method);
      return method;
    },
  }) as TController;
};
