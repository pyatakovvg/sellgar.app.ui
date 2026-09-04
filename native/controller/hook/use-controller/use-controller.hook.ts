import React from 'react';

import type { DependencyToken } from '../../../../core/di/token/dependency-token';
import type { ControllerRuntimeContextValue } from '../../runtime/controller-runtime-context';
import { useControllerRuntime } from '../../runtime/controller-runtime-context';

export const useController = <TController extends object>(
  controllerToken: DependencyToken<TController>,
): TController => {
  const runtime = useControllerRuntime();
  const controller = runtime.getController(controllerToken);

  return React.useMemo(
    () => createControllerFacade(controllerToken, controller, runtime),
    [controller, controllerToken, runtime],
  );
};

const createControllerFacade = <TController extends object>(
  controllerToken: DependencyToken<TController>,
  controller: TController,
  runtime: ControllerRuntimeContextValue,
): TController => {
  const methods = new Map<string | symbol, (...args: readonly unknown[]) => unknown>();

  return new Proxy(controller, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown;

      if (typeof value !== 'function') return value;

      const cached = methods.get(property);

      if (cached) return cached;

      const method = (...args: readonly unknown[]): unknown => runtime.invoke(controllerToken, property, args);

      methods.set(property, method);

      return method;
    },
  });
};
