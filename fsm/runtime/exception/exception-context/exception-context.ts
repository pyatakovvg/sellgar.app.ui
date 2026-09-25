import React from 'react';
import type { RuntimeException } from '../../../../core/runtime/exception/runtime-exception';

export const ExceptionContext = React.createContext<RuntimeException | null>(null);
