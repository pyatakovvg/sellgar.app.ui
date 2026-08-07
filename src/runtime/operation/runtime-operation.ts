import { isHttpException } from '../../http';
import { captureRuntimeFailure, getRuntimeOperationError, throwRuntimeOperationError } from '../failure';
import type { RuntimeFailure, RuntimeFailureSource } from '../failure';
import { isRuntimeInterruption, type RuntimeInterruptionReason } from './runtime-interruption.ts';

export interface RuntimeRevisionSource {
  readonly revision: number;
}

export interface RuntimeOperationGuard {
  readonly revision: number;

  isInterrupted(): boolean;

  subscribe?(listener: () => void): () => void;
}

export type RuntimeOperationResult<TValue> =
  | {
      readonly type: 'completed';
      readonly value: TValue;
    }
  | {
      readonly failure: RuntimeFailure;
      readonly type: 'failed';
    }
  | {
      readonly cause: unknown;
      readonly reason: 'guard-interrupted' | RuntimeInterruptionReason;
      readonly type: 'interrupted';
    }
  | {
      readonly error: unknown;
      readonly source: RuntimeFailureSource;
      readonly type: 'rejected';
    };

export interface RuntimeOperationOptions<TValue> {
  readonly guard: RuntimeOperationGuard | null;
  readonly operation: () => TValue | Promise<TValue>;
  readonly signal?: AbortSignal;
  readonly source: RuntimeFailureSource;
}

export const createRuntimeRevisionGuard = (source: RuntimeRevisionSource): RuntimeOperationGuard => {
  const revision = source.revision;
  const subscribe = (source as RuntimeRevisionSource & RevisionSourceSubscription).subscribe;

  return {
    isInterrupted: () => source.revision !== revision,
    revision,
    subscribe:
      typeof subscribe === 'function'
        ? (listener) =>
            subscribe.call(source, () => {
              if (source.revision !== revision) listener();
            })
        : undefined,
  };
};

export const executeRuntimeOperation = async <TValue>(
  options: RuntimeOperationOptions<TValue>,
): Promise<RuntimeOperationResult<TValue>> => {
  const operationPromise = executeRuntimeOperationBody(options);
  const guardInterruption = createGuardInterruption(options.guard);

  try {
    return await Promise.race([operationPromise, guardInterruption.promise]);
  } finally {
    guardInterruption.dispose();
  }
};

const executeRuntimeOperationBody = async <TValue>(
  options: RuntimeOperationOptions<TValue>,
): Promise<RuntimeOperationResult<TValue>> => {
  try {
    const value = await options.operation();

    if (options.guard?.isInterrupted()) {
      return {
        cause: undefined,
        reason: 'guard-interrupted',
        type: 'interrupted',
      };
    }

    return { type: 'completed', value };
  } catch (error) {
    const operationError = getRuntimeOperationError(error, options.source);

    if (isRuntimeInterruption(operationError.cause)) {
      return {
        cause: operationError.cause.cause,
        reason: operationError.cause.reason,
        type: 'interrupted',
      };
    }

    if (options.signal?.aborted || options.guard?.isInterrupted()) {
      return {
        cause: operationError.cause,
        reason: 'guard-interrupted',
        type: 'interrupted',
      };
    }

    if (
      isHttpException(operationError.cause) &&
      operationError.cause.status >= 400 &&
      operationError.cause.status < 500
    ) {
      return {
        error: operationError.cause,
        source: operationError.source,
        type: 'rejected',
      };
    }

    return {
      failure: captureRuntimeFailure(error, options.source),
      type: 'failed',
    };
  }
};

interface RevisionSourceSubscription {
  readonly subscribe?: (listener: () => void) => () => void;
}

interface GuardInterruption<TResult> {
  dispose(): void;
  readonly promise: Promise<TResult>;
}

const createGuardInterruption = <TValue>(
  guard: RuntimeOperationGuard | null,
): GuardInterruption<RuntimeOperationResult<TValue>> => {
  let unsubscribe = (): void => {};
  const promise = new Promise<RuntimeOperationResult<TValue>>((resolve) => {
    const interrupt = (): void => {
      resolve({
        cause: undefined,
        reason: 'guard-interrupted',
        type: 'interrupted',
      });
    };

    if (guard?.isInterrupted()) {
      interrupt();
      return;
    }

    unsubscribe = guard?.subscribe?.(interrupt) ?? unsubscribe;
  });

  return {
    dispose: () => unsubscribe(),
    promise,
  };
};

export const executeRuntimeParticipant = async <TValue>(
  source: RuntimeFailureSource,
  operation: () => TValue | Promise<TValue>,
): Promise<TValue> => {
  try {
    return await operation();
  } catch (error) {
    return throwRuntimeOperationError(error, source);
  }
};
