import type { RuntimeFailure } from '../../failure/runtime-failure';

// Execution context stays with its runtime, never in serializable error metadata.
export interface RuntimeRetryOperation {
  readonly kind: 'action' | 'controller' | 'loaders' | 'render';
  run(signal: AbortSignal): unknown | Promise<unknown>;
}

export const isLoaderFailure = (failure: RuntimeFailure): boolean =>
  failure.source.operation === 'loader' && failure.source.participant.kind === 'controller';

// A controller may escalate an error returned by a nested action or revalidation.
// Keep its retry context private and tied to the original cause, not the outer method.
export class RuntimeRetryOperations {
  private readonly operations = new WeakMap<object, RuntimeRetryOperation>();

  remember(cause: unknown, operation: RuntimeRetryOperation): void {
    if ((typeof cause === 'object' && cause !== null) || typeof cause === 'function') {
      this.operations.set(cause, operation);
    }
  }

  resolve(cause: unknown, fallback: RuntimeRetryOperation): RuntimeRetryOperation {
    return (typeof cause === 'object' && cause !== null) || typeof cause === 'function'
      ? (this.operations.get(cause) ?? fallback)
      : fallback;
  }
}
