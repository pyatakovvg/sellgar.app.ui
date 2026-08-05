import React from 'react';

import type { WidgetRuntime } from '../../runtime/widget-runtime';

export const WidgetRuntimeContext = React.createContext<WidgetRuntime<object> | null>(null);

export interface WidgetRuntimeProviderProps<TProps extends object = object> {
  readonly children: React.ReactNode;
  readonly runtime: WidgetRuntime<TProps>;
}

export const WidgetRuntimeProvider = <TProps extends object = object>({
  children,
  runtime,
}: WidgetRuntimeProviderProps<TProps>): React.ReactElement => {
  return (
    <WidgetRuntimeContext.Provider value={runtime as unknown as WidgetRuntime<object>}>
      {children}
    </WidgetRuntimeContext.Provider>
  );
};

export const useWidgetRuntime = <TProps extends object = Record<string, never>>(): WidgetRuntime<TProps> => {
  const runtime = React.useContext(WidgetRuntimeContext);

  if (!runtime) {
    throw new Error('Runtime виджета недоступен.');
  }

  return runtime as WidgetRuntime<TProps>;
};
