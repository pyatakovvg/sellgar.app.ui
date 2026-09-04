import React from 'react';

import { ExceptionContext } from './exception-context.ts';

export const useException = (): unknown => {
  return React.useContext(ExceptionContext);
};
