import { isHttpException } from '../../../http/exception/http-exception';
import { isRuntimeExceptionSignal } from '../../exception/runtime-exception';
import {
  captureRuntimeFailure,
  getRuntimeOperationError,
  throwRuntimeOperationError,
} from '../../failure/runtime-failure-signal';
import type { RuntimeFailure, RuntimeFailureSource } from '../../failure/runtime-failure';
import { isRuntimeInterruption, type RuntimeInterruptionReason } from '../runtime-interruption';

export interface RuntimeRevisionSource {
  readonly revision: number;

  subscribeInterruption?(listener: () => void): () => void;
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
    }
  | {
      readonly failure: RuntimeFailure;
      readonly type: 'escalated';
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

export const createRuntimeCompletionRevisionGuard = (source: RuntimeRevisionSource): RuntimeOperationGuard => {
  const revision = source.revision;
  const subscribe = source.subscribeInterruption;

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
  const guardInterruption = createGuardInterruption<TValue>(options.guard);

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

    if (isRuntimeExceptionSignal(error)) {
      return {
        failure: captureRuntimeFailure(error, options.source),
        type: 'escalated',
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

export const executeRuntimeParticipant = <TValue>(
  source: RuntimeFailureSource,
  operation: () => TValue | Promise<TValue>,
): TValue | Promise<TValue> => {
  try {
    const value = operation();

    if (isPromiseLike(value)) {
      return value.catch((error) => {
        return throwRuntimeOperationError(error, source);
      });
    }

    return value;
  } catch (error) {
    return throwRuntimeOperationError(error, source);
  }
};

const isPromiseLike = <TValue>(value: TValue): value is TValue & Promise<Awaited<TValue>> => {
  return (
    ((typeof value === 'object' && value !== null) || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  );
};
