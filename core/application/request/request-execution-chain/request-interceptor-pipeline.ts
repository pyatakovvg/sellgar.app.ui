import { createRuntimeInterruption } from '../../../runtime/operation/runtime-interruption';
import type { RequestOperation } from '../request-executor';
import type {
  RequestFulfilledHandler,
  RequestInterceptorContext,
  RequestRejectedHandler,
  ResponseFulfilledHandler,
  ResponseRejectedHandler,
} from './request-interceptor.types.ts';

interface ResponseInterceptor {
  readonly onFulfilled?: ResponseFulfilledHandler;
  readonly onRejected?: ResponseRejectedHandler;
}

interface RequestPipelineExecution {
  readonly initial: RequestInterceptorContext;
  current: RequestInterceptorContext;
}

/** Immutable transformation chain; every execution owns its current configuration. */
export class RequestInterceptorPipeline<TContext extends RequestInterceptorContext> {
  private constructor(
    private readonly prepare: (execution: RequestPipelineExecution) => Promise<TContext>,
    private readonly responses: readonly ResponseInterceptor[] = [],
  ) {}

  static initial(): RequestInterceptorPipeline<RequestInterceptorContext> {
    return new RequestInterceptorPipeline((execution) => Promise.resolve(execution.current));
  }

  withRequest<TNext extends TContext>(
    onFulfilled: RequestFulfilledHandler<TContext, TNext>,
    onRejected?: RequestRejectedHandler<TNext>,
  ): RequestInterceptorPipeline<TNext> {
    return new RequestInterceptorPipeline((execution) => {
      const prepared = this.prepare(execution).then(
        (context) => {
          this.assertActive(execution);
          return onFulfilled(context);
        },
        (error: unknown) => {
          this.assertActive(execution);
          if (!onRejected) throw error;
          return onRejected(error, execution.current);
        },
      );

      return prepared.then((context) => {
        this.assertActive(execution);
        this.assertConfiguration(context, execution.initial);
        execution.current = context;
        return context;
      });
    }, this.responses);
  }

  withResponse(
    onFulfilled?: ResponseFulfilledHandler,
    onRejected?: ResponseRejectedHandler,
  ): RequestInterceptorPipeline<TContext> {
    return new RequestInterceptorPipeline(this.prepare, [...this.responses, { onFulfilled, onRejected }]);
  }

  execute<T>(operation: RequestOperation<T, TContext>, initial: RequestInterceptorContext): Promise<T> {
    const execution: RequestPipelineExecution = { initial, current: initial };
    let result = this.prepare(execution).then((context) => {
      this.assertActive(execution);
      return operation(context);
    });

    for (const { onFulfilled, onRejected } of this.responses) {
      result = result.then(
        (value) => {
          this.assertActive(execution);
          return onFulfilled ? onFulfilled(value, execution.current) : value;
        },
        (error: unknown) => {
          this.assertActive(execution);
          if (!onRejected) throw error;
          return onRejected<T>(error, execution.current);
        },
      );
    }

    return result;
  }

  private assertConfiguration(context: RequestInterceptorContext, initial: RequestInterceptorContext): void {
    if (!context || typeof context !== 'object') {
      throw new TypeError('Request interceptor must return a configuration object.');
    }
    if (context.signal !== initial.signal || context.options !== initial.options) {
      throw new TypeError('Request interceptor cannot replace the execution signal or queue options.');
    }
  }

  private assertActive(execution: RequestPipelineExecution): void {
    if (execution.initial.signal.aborted) {
      throw createRuntimeInterruption(undefined, 'request-cancelled');
    }
  }
}
