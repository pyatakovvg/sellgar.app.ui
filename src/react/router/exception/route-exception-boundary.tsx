import React from 'react';
import { useRouteError } from 'react-router-dom';

import { ExceptionProvider } from './exception.context';

export interface RouteExceptionRuntime {
  getException(inheritedException?: React.ReactNode): React.ReactNode;
}

export interface RouteExceptionBoundaryProps {
  readonly exception?: React.ReactNode;
  readonly forbidden?: React.ReactNode;
  readonly notFound?: React.ReactNode;
  readonly routeRuntime?: RouteExceptionRuntime;
}

export const RouteExceptionBoundary: React.FC<RouteExceptionBoundaryProps> = ({
  exception,
  forbidden,
  notFound,
  routeRuntime,
}) => {
  const error = useRouteError();
  const statusException = resolveStatusException(error, forbidden, notFound);
  const resolvedException = statusException ?? routeRuntime?.getException(exception) ?? exception ?? null;

  return <ExceptionProvider error={error}>{resolvedException}</ExceptionProvider>;
};

interface ErrorResponseLike {
  readonly status: number;
}

const resolveStatusException = (
  error: unknown,
  forbidden: React.ReactNode | undefined,
  notFound: React.ReactNode | undefined,
): React.ReactNode | undefined => {
  if (!isErrorResponseLike(error)) {
    return void 0;
  }

  if (error.status === 403) {
    return forbidden;
  }

  if (error.status === 404) {
    return notFound;
  }

  return void 0;
};

const isErrorResponseLike = (error: unknown): error is ErrorResponseLike => {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return false;
  }

  return typeof (error as { readonly status: unknown }).status === 'number';
};
