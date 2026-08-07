import type { RuntimeFailure, RuntimeFailureSource } from './runtime-failure.ts';
import { createRuntimeFailure } from './runtime-failure.ts';

const RUNTIME_OPERATION_SIGNAL = Symbol('RuntimeOperationSignal');
const failures = new WeakMap<object, RuntimeFailure>();

interface RuntimeOperationSignal {
  readonly [RUNTIME_OPERATION_SIGNAL]: true;
  readonly failure: RuntimeFailure;
}

export const captureRuntimeFailure = (error: unknown, source: RuntimeFailureSource): RuntimeFailure => {
  if (isRuntimeOperationSignal(error)) {
    return error.failure;
  }

  if (isObject(error)) {
    const existingFailure = failures.get(error);

    if (existingFailure) {
      return existingFailure;
    }
  }

  return createRuntimeFailure(error, source);
};

export const throwRuntimeOperationError = (error: unknown, source: RuntimeFailureSource): never => {
  if (isRuntimeOperationSignal(error)) {
    throw error;
  }

  if (isObject(error)) {
    if (!failures.has(error)) {
      failures.set(error, createRuntimeFailure(error, source));
    }

    throw error;
  }

  const signal: RuntimeOperationSignal = {
    [RUNTIME_OPERATION_SIGNAL]: true,
    failure: createRuntimeFailure(error, source),
  };

  throw signal;
};

export const getRuntimeFailureCause = (failure: RuntimeFailure): unknown => {
  return failure.cause;
};

export const getRuntimeOperationError = (
  error: unknown,
  fallbackSource: RuntimeFailureSource,
): { readonly cause: unknown; readonly source: RuntimeFailureSource } => {
  if (isRuntimeOperationSignal(error)) {
    return {
      cause: error.failure.cause,
      source: error.failure.source,
    };
  }

  if (isObject(error)) {
    const failure = failures.get(error);

    if (failure) {
      return {
        cause: failure.cause,
        source: failure.source,
      };
    }
  }

  return {
    cause: error,
    source: fallbackSource,
  };
};

const isRuntimeOperationSignal = (value: unknown): value is RuntimeOperationSignal => {
  return (
    typeof value === 'object' &&
    value !== null &&
    RUNTIME_OPERATION_SIGNAL in value &&
    Reflect.get(value, RUNTIME_OPERATION_SIGNAL) === true
  );
};

const isObject = (value: unknown): value is object => {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
};
