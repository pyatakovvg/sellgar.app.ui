import { captureRuntimeFailure, throwRuntimeFailure } from '../failure';
import type { RuntimeFailure, RuntimeFailureSource } from '../failure';

export interface RuntimeRevisionSource {
  readonly revision: number;
}

export interface RuntimeOperationGuard {
  readonly revision: number;

  isInterrupted(): boolean;
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
      readonly reason: 'guard-interrupted';
      readonly type: 'interrupted';
    };

export interface RuntimeOperationOptions<TValue> {
  readonly guard: RuntimeOperationGuard | null;
  readonly operation: () => TValue | Promise<TValue>;
  readonly signal?: AbortSignal;
  readonly source: RuntimeFailureSource;
}

export const createRuntimeRevisionGuard = (source: RuntimeRevisionSource): RuntimeOperationGuard => {
  const revision = source.revision;

  return {
    isInterrupted: () => source.revision !== revision,
    revision,
  };
};

export const executeRuntimeOperation = async <TValue>(
  options: RuntimeOperationOptions<TValue>,
): Promise<RuntimeOperationResult<TValue>> => {
  try {
    return {
      type: 'completed',
      value: await options.operation(),
    };
  } catch (error) {
    if (options.signal?.aborted || options.guard?.isInterrupted()) {
      return {
        cause: error,
        reason: 'guard-interrupted',
        type: 'interrupted',
      };
    }

    return {
      failure: captureRuntimeFailure(error, options.source),
      type: 'failed',
    };
  }
};

export const executeRuntimeParticipant = async <TValue>(
  source: RuntimeFailureSource,
  operation: () => TValue | Promise<TValue>,
): Promise<TValue> => {
  try {
    return await operation();
  } catch (error) {
    return throwRuntimeFailure(error, source);
  }
};
