import React from 'react';

import type { WidgetRuntime } from '../../../../core/widget/runtime/widget-runtime';

const WidgetRuntimeContext = React.createContext<WidgetRuntime<object> | null>(null);

interface IProps<TProps extends object> {
  readonly children: React.ReactNode;
  readonly runtime: WidgetRuntime<TProps>;
}

export const WidgetRuntimeProvider = <TProps extends object>(props: IProps<TProps>): React.ReactElement => {
  return (
    <WidgetRuntimeContext.Provider value={props.runtime as WidgetRuntime<object>}>
      {props.children}
    </WidgetRuntimeContext.Provider>
  );
};

export const useWidgetRuntime = <TProps extends object>(): WidgetRuntime<TProps> => {
  const runtime = React.useContext(WidgetRuntimeContext);

  if (!runtime) {
    throw new Error('Runtime виджета недоступен.');
  }

  return runtime as WidgetRuntime<TProps>;
};
