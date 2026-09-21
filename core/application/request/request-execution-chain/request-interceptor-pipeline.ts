import { createRuntimeInterruption } from '../../../runtime/operation/runtime-interruption';
import type { RequestOperation } from '../request-executor';
import type {
  RequestFulfilledHandler,
  RequestInterceptorContext,
  RequestRejectedHandler,
  ResponseFulfilledHandler,
  ResponseRejectedHandler,
} from './request-interceptor.types.ts';

interface RequestInterceptor {
  readonly onFulfilled?: RequestFulfilledHandler;
  readonly onRejected?: RequestRejectedHandler;
}

interface ResponseInterceptor {
  readonly onFulfilled?: ResponseFulfilledHandler;
  readonly onRejected?: ResponseRejectedHandler;
}

/** Immutable callbacks for a task; scheduling and session recovery belong to the executor. */
export class RequestInterceptorPipeline {
  constructor(
    private readonly requests: readonly RequestInterceptor[] = [],
    private readonly responses: readonly ResponseInterceptor[] = [],
  ) {}

  withRequest(onFulfilled?: RequestFulfilledHandler, onRejected?: RequestRejectedHandler): RequestInterceptorPipeline {
    return new RequestInterceptorPipeline([...this.requests, { onFulfilled, onRejected }], this.responses);
  }

  withResponse(
    onFulfilled?: ResponseFulfilledHandler,
    onRejected?: ResponseRejectedHandler,
  ): RequestInterceptorPipeline {
    return new RequestInterceptorPipeline(this.requests, [...this.responses, { onFulfilled, onRejected }]);
  }

  execute<T>(operation: RequestOperation<T>, context: RequestInterceptorContext): Promise<T> {
    let preparation = Promise.resolve();

    for (const { onFulfilled, onRejected } of this.requests) {
      preparation = preparation.then(
        () => {
          this.assertActive(context);
          return onFulfilled?.(context);
        },
        (error: unknown) => {
          this.assertActive(context);
          if (!onRejected) throw error;
          return onRejected(error, context);
        },
      );
    }

    let result = preparation.then(() => {
      this.assertActive(context);
      return operation(context);
    });

    for (const { onFulfilled, onRejected } of this.responses) {
      result = result.then(
        (value) => {
          this.assertActive(context);
          return onFulfilled ? onFulfilled(value, context) : value;
        },
        (error: unknown) => {
          this.assertActive(context);
          if (!onRejected) throw error;
          return onRejected<T>(error, context);
        },
      );
    }

    return result;
  }

  private assertActive(context: RequestInterceptorContext): void {
    if (context.signal.aborted) {
      throw createRuntimeInterruption(undefined, 'request-cancelled');
    }
  }
}
