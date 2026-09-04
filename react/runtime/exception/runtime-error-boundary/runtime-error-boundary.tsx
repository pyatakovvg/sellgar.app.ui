import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { ExceptionProvider } from '../exception-context';

interface IProps {
  readonly children: React.ReactNode;
  readonly exception: React.ReactNode;
  readonly onError: (error: unknown) => void;
  readonly resetKeys: readonly unknown[];
}

export const RuntimeErrorBoundary: React.FC<IProps> = (props) => {
  return (
    <ErrorBoundary
      fallbackRender={({ error }) => <ExceptionProvider error={error}>{props.exception}</ExceptionProvider>}
      onError={props.onError}
      resetKeys={[...props.resetKeys]}
    >
      {props.children}
    </ErrorBoundary>
  );
};
