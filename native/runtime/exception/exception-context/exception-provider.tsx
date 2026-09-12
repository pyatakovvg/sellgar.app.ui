import React from 'react';
import type { RuntimeException } from '../../../../core/runtime/exception/runtime-exception';

import { ExceptionContext } from './exception-context.ts';

interface IProps {
  readonly children: React.ReactNode;
  readonly exception: RuntimeException;
}

export const ExceptionProvider: React.FC<IProps> = (props) => {
  return <ExceptionContext.Provider value={props.exception}>{props.children}</ExceptionContext.Provider>;
};
