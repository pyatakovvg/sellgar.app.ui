import React from 'react';

import { ControllerRuntimeContext, type ControllerRuntimeContextValue } from './controller-runtime-context.ts';

interface IProps {
  readonly children: React.ReactNode;
  readonly value: ControllerRuntimeContextValue;
}

export const ControllerRuntimeProvider: React.FC<IProps> = (props) => {
  return <ControllerRuntimeContext.Provider value={props.value}>{props.children}</ControllerRuntimeContext.Provider>;
};
