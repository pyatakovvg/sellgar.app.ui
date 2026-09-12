import { Exception } from '../../../exception/contract/exception';
import type {
  RuntimeFailure,
  RuntimeFailureDisposition,
  RuntimeFailureHop,
  RuntimeOwner,
  RuntimeParticipant,
} from '../../failure/runtime-failure';

export interface RuntimeExceptionBoundary {
  readonly disposition: RuntimeFailureDisposition;
  readonly owner: RuntimeOwner;
  readonly phase: 'failed';
}

export interface RuntimeExceptionOrigin {
  readonly owner: RuntimeOwner;
  readonly participant: RuntimeParticipant;
  readonly phase: string;
}

export interface RuntimeExceptionRecoveryAction {
  (): Promise<void>;

  readonly inProcess: boolean;
}

export interface RuntimeExceptionRecovery {
  readonly back?: RuntimeExceptionRecoveryAction;
  readonly close?: RuntimeExceptionRecoveryAction;
  readonly retry?: RuntimeExceptionRecoveryAction;
  readonly root?: RuntimeExceptionRecoveryAction;
}

export interface RuntimeExceptionRecoveryOperations {
  readonly back?: () => Promise<void>;
  readonly close?: () => Promise<void>;
  readonly retry?: () => Promise<void>;
  readonly root?: () => Promise<void>;
}

export interface RuntimeException {
  readonly boundary: RuntimeExceptionBoundary;
  readonly cause: unknown;
  readonly createdAt: number;
  readonly error: Error;
  readonly id: string;
  readonly origin: RuntimeExceptionOrigin;
  readonly recovery: RuntimeExceptionRecovery;
  readonly trace: readonly RuntimeFailureHop[];
}

export interface CreateRuntimeExceptionOptions {
  readonly disposition: RuntimeFailureDisposition;
  readonly owner: RuntimeOwner;
  readonly phase: 'failed';
  readonly recovery?: RuntimeExceptionRecoveryOperations;
}

interface RuntimeExceptionRecoveryStore {
  readonly getSnapshot: () => number;
  readonly subscribe: (listener: () => void) => () => void;
}

const recoveryStores = new WeakMap<RuntimeExceptionRecovery, RuntimeExceptionRecoveryStore>();

export const createRuntimeException = (
  failure: RuntimeFailure,
  options: CreateRuntimeExceptionOptions,
): RuntimeException => {
  const boundary: RuntimeExceptionBoundary = Object.freeze({
    disposition: options.disposition,
    owner: options.owner,
    phase: options.phase,
  });
  const boundaryHop: RuntimeFailureHop = Object.freeze({
    at: Date.now(),
    disposition: options.disposition,
    owner: options.owner,
  });

  return Object.freeze({
    boundary,
    cause: failure.cause,
    createdAt: failure.createdAt,
    error: normalizeRuntimeExceptionError(failure.cause),
    id: failure.id,
    origin: Object.freeze({
      owner: failure.source.owner,
      participant: failure.source.participant,
      phase: failure.source.operation,
    }),
    recovery: createRuntimeExceptionRecovery(options.recovery),
    trace: Object.freeze([...failure.propagation, boundaryHop]),
  });
};

export const getRuntimeExceptionRecoverySnapshot = (recovery: RuntimeExceptionRecovery): number =>
  recoveryStores.get(recovery)?.getSnapshot() ?? 0;

export const subscribeRuntimeExceptionRecovery = (
  recovery: RuntimeExceptionRecovery,
  listener: () => void,
): (() => void) => recoveryStores.get(recovery)?.subscribe(listener) ?? EMPTY_UNSUBSCRIBE;

export const requireRuntimeException = (exception: RuntimeException | null): RuntimeException => {
  if (exception === null) {
    throw new Error('Failed runtime boundary должна содержать RuntimeException.');
  }

  return exception;
};

const normalizeRuntimeExceptionError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Exception(resolveUnknownErrorMessage(cause), { cause });

const createRuntimeExceptionRecovery = (
  operations: RuntimeExceptionRecoveryOperations = {},
): RuntimeExceptionRecovery => {
  const listeners = new Set<() => void>();
  let revision = 0;
  const publish = (): void => {
    revision += 1;

    for (const listener of listeners) listener();
  };
  const recovery = Object.freeze({
    back: createRuntimeExceptionRecoveryAction(operations.back, publish),
    close: createRuntimeExceptionRecoveryAction(operations.close, publish),
    retry: createRuntimeExceptionRecoveryAction(operations.retry, publish),
    root: createRuntimeExceptionRecoveryAction(operations.root, publish),
  });

  recoveryStores.set(recovery, {
    getSnapshot: () => revision,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
  });

  return recovery;
};

const createRuntimeExceptionRecoveryAction = (
  operation: (() => Promise<void>) | undefined,
  publish: () => void,
): RuntimeExceptionRecoveryAction | undefined => {
  if (!operation) return undefined;

  let inProcess = false;
  let running: Promise<void> | null = null;
  const action = (() => {
    if (running) return running;

    inProcess = true;
    publish();

    const task = Promise.resolve()
      .then(operation)
      .finally(() => {
        if (running !== task) return;

        running = null;
        inProcess = false;
        publish();
      });

    running = task;
    return task;
  }) as RuntimeExceptionRecoveryAction;

  Object.defineProperty(action, 'inProcess', {
    enumerable: true,
    get: () => inProcess,
  });

  return action;
};

const EMPTY_UNSUBSCRIBE = (): void => undefined;

const resolveUnknownErrorMessage = (cause: unknown): string => {
  if (typeof cause === 'string' && cause.length > 0) {
    return cause;
  }

  if (typeof cause === 'object' && cause !== null) {
    const message = Reflect.get(cause, 'message');

    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }

  return 'Unknown runtime exception.';
};
