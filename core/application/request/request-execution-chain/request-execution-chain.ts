import type { RequestExecutionOptions, RequestOperation } from '../request-executor';
import type {
  RequestExecutionChainInterface,
  RequestInterceptorRegistration,
  ResponseInterceptorRegistration,
} from './request-execution-chain.interface.ts';
import type {
  RequestFulfilledHandler,
  RequestInterceptorContext,
  RequestRejectedHandler,
  ResponseFulfilledHandler,
  ResponseRejectedHandler,
} from './request-interceptor.types.ts';
import type { RequestInterceptorPipeline } from './request-interceptor-pipeline.ts';

export type RequestChainSubmission = <T>(
  options: RequestExecutionOptions,
  operation: RequestOperation<T, RequestInterceptorContext>,
) => Promise<T>;

export class RequestExecutionChain<
  TContext extends RequestInterceptorContext,
> implements RequestExecutionChainInterface<TContext> {
  constructor(
    private readonly submit: RequestChainSubmission,
    private readonly interceptors: RequestInterceptorPipeline<TContext>,
  ) {}

  get request(): RequestInterceptorRegistration<TContext> {
    return { use: this.useRequest.bind(this) };
  }

  get response(): ResponseInterceptorRegistration<TContext> {
    return { use: this.useResponse.bind(this) };
  }

  run<T>(operation: RequestOperation<T, TContext>): Promise<T>;
  run<T>(options: RequestExecutionOptions, operation: RequestOperation<T, TContext>): Promise<T>;
  run<T>(
    optionsOrOperation: RequestExecutionOptions | RequestOperation<T, TContext>,
    maybeOperation?: RequestOperation<T, TContext>,
  ): Promise<T> {
    const options = typeof optionsOrOperation === 'function' ? {} : optionsOrOperation;
    const operation = typeof optionsOrOperation === 'function' ? optionsOrOperation : maybeOperation;

    if (!operation) {
      throw new Error('Операция запроса обязательна.');
    }

    return this.submit(options, (context) => this.interceptors.execute(operation, context));
  }

  private useRequest<TNext extends TContext>(
    onFulfilled: RequestFulfilledHandler<TContext, TNext>,
    onRejected?: RequestRejectedHandler<TNext>,
  ): RequestExecutionChainInterface<TNext>;
  private useRequest(
    onFulfilled?: undefined,
    onRejected?: RequestRejectedHandler<TContext>,
  ): RequestExecutionChainInterface<TContext>;
  private useRequest(
    onFulfilled?: RequestFulfilledHandler<TContext>,
    onRejected?: RequestRejectedHandler<TContext>,
  ): RequestExecutionChainInterface<TContext> {
    return new RequestExecutionChain(
      this.submit,
      this.interceptors.withRequest(onFulfilled ?? ((context) => context), onRejected),
    );
  }

  private useResponse(
    onFulfilled?: ResponseFulfilledHandler,
    onRejected?: ResponseRejectedHandler,
  ): RequestExecutionChainInterface<TContext> {
    return new RequestExecutionChain(this.submit, this.interceptors.withResponse(onFulfilled, onRejected));
  }
}
