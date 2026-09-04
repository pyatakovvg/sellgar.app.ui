import React from 'react';

import { ExceptionContext } from './exception-context.ts';

interface IProps {
  readonly children: React.ReactNode;
  readonly error: unknown;
}

export const ExceptionProvider: React.FC<IProps> = (props) => {
  return <ExceptionContext.Provider value={props.error}>{props.children}</ExceptionContext.Provider>;
};
