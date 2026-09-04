const RUNTIME_EXCEPTION_SIGNAL = Symbol('RuntimeExceptionSignal');

export interface RuntimeExceptionSignal {
  readonly [RUNTIME_EXCEPTION_SIGNAL]: true;
  readonly cause: unknown;
}

export const createRuntimeExceptionSignal = (cause: unknown): RuntimeExceptionSignal => {
  return {
    [RUNTIME_EXCEPTION_SIGNAL]: true,
    cause,
  };
};

export const isRuntimeExceptionSignal = (value: unknown): value is RuntimeExceptionSignal => {
  return (
    typeof value === 'object' &&
    value !== null &&
    RUNTIME_EXCEPTION_SIGNAL in value &&
    Reflect.get(value, RUNTIME_EXCEPTION_SIGNAL) === true
  );
};
