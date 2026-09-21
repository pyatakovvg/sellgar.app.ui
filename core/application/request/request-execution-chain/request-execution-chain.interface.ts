import type { RequestExecutionOptions, RequestOperation } from '../request-executor';
import type {
  RequestFulfilledHandler,
  RequestRejectedHandler,
  ResponseFulfilledHandler,
  ResponseRejectedHandler,
  RequestInterceptorContext,
} from './request-interceptor.types.ts';

export interface RequestInterceptorRegistration<
  TContext extends RequestInterceptorContext = RequestInterceptorContext,
> {
  use<TNext extends TContext>(
    onFulfilled: RequestFulfilledHandler<TContext, TNext>,
    onRejected?: RequestRejectedHandler<TNext>,
  ): RequestExecutionChainInterface<TNext>;
  use(onFulfilled?: undefined, onRejected?: RequestRejectedHandler<TContext>): RequestExecutionChainInterface<TContext>;
}

export interface ResponseInterceptorRegistration<
  TContext extends RequestInterceptorContext = RequestInterceptorContext,
> {
  use(
    onFulfilled?: ResponseFulfilledHandler,
    onRejected?: ResponseRejectedHandler,
  ): RequestExecutionChainInterface<TContext>;
}

export interface RequestExecutionChainInterface<
  TContext extends RequestInterceptorContext = RequestInterceptorContext,
> {
  readonly request: RequestInterceptorRegistration<TContext>;
  readonly response: ResponseInterceptorRegistration<TContext>;

  run<T>(operation: RequestOperation<T, TContext>): Promise<T>;
  run<T>(options: RequestExecutionOptions, operation: RequestOperation<T, TContext>): Promise<T>;
}
