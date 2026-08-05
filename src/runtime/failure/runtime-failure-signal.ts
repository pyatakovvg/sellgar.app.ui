import type { RuntimeFailure, RuntimeFailureSource } from './runtime-failure.ts';
import { createRuntimeFailure } from './runtime-failure.ts';

const RUNTIME_FAILURE_SIGNAL = Symbol('RuntimeFailureSignal');
const failures = new WeakMap<object, RuntimeFailure>();

interface RuntimeFailureSignal {
  readonly [RUNTIME_FAILURE_SIGNAL]: true;
  readonly failure: RuntimeFailure;
}

export const captureRuntimeFailure = (error: unknown, source: RuntimeFailureSource): RuntimeFailure => {
  if (isRuntimeFailureSignal(error)) {
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

export const throwRuntimeFailure = (error: unknown, source: RuntimeFailureSource): never => {
  if (isRuntimeFailureSignal(error)) {
    throw error;
  }

  if (isObject(error)) {
    if (!failures.has(error)) {
      failures.set(error, createRuntimeFailure(error, source));
    }

    throw error;
  }

  const signal: RuntimeFailureSignal = {
    [RUNTIME_FAILURE_SIGNAL]: true,
    failure: createRuntimeFailure(error, source),
  };

  throw signal;
};

export const getRuntimeFailureCause = (failure: RuntimeFailure): unknown => {
  return failure.cause;
};

const isRuntimeFailureSignal = (value: unknown): value is RuntimeFailureSignal => {
  return (
    typeof value === 'object' &&
    value !== null &&
    RUNTIME_FAILURE_SIGNAL in value &&
    Reflect.get(value, RUNTIME_FAILURE_SIGNAL) === true
  );
};

const isObject = (value: unknown): value is object => {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
};
