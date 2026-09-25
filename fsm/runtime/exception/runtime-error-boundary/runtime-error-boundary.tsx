import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import type { RuntimeException } from '../../../../core/runtime/exception/runtime-exception';

import { ExceptionProvider } from '../exception-context';

interface IProps {
  readonly children: React.ReactNode;
  readonly exception: React.ReactNode;
  readonly onError: (error: unknown) => void;
  readonly resolveException: (error: unknown) => RuntimeException;
  readonly resetKeys: readonly unknown[];
}

export const RuntimeErrorBoundary: React.FC<IProps> = (props) => {
  return (
    <ErrorBoundary
      fallbackRender={({ error }) => (
        <ExceptionProvider exception={props.resolveException(error)}>{props.exception}</ExceptionProvider>
      )}
      onError={props.onError}
      resetKeys={[...props.resetKeys]}
    >
      {props.children}
    </ErrorBoundary>
  );
};
