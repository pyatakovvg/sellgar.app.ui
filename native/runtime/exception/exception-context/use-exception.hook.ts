import React from 'react';
import {
  getRuntimeExceptionRecoverySnapshot,
  subscribeRuntimeExceptionRecovery,
  type RuntimeException,
} from '../../../../core/runtime/exception/runtime-exception';

import { ExceptionContext } from './exception-context.ts';

export const useException = (): RuntimeException => {
  const exception = React.useContext(ExceptionContext);
  const subscribe = React.useCallback(
    (listener: () => void) =>
      exception ? subscribeRuntimeExceptionRecovery(exception.recovery, listener) : EMPTY_UNSUBSCRIBE,
    [exception],
  );
  const getSnapshot = React.useCallback(
    () => (exception ? getRuntimeExceptionRecoverySnapshot(exception.recovery) : 0),
    [exception],
  );

  React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (exception === null) {
    throw new Error('useException() доступен только внутри framework exception boundary.');
  }

  return exception;
};

const EMPTY_UNSUBSCRIBE = (): void => undefined;
