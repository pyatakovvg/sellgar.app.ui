import React from 'react';
import type { ControllerRuntimeContextValue } from '../../../../shared/controller/runtime/controller-runtime';
export type { ControllerRuntimeContextValue } from '../../../../shared/controller/runtime/controller-runtime';

export const ControllerRuntimeContext = React.createContext<ControllerRuntimeContextValue | null>(null);
