import type { RequestExecutionOptions, RequestOperation } from '../request-executor';
import type {
  RequestFulfilledHandler,
  RequestRejectedHandler,
  ResponseFulfilledHandler,
  ResponseRejectedHandler,
} from './request-interceptor.types.ts';

export interface RequestInterceptorRegistration {
  use(onFulfilled?: RequestFulfilledHandler, onRejected?: RequestRejectedHandler): RequestExecutionChainInterface;
}

export interface ResponseInterceptorRegistration {
  use(onFulfilled?: ResponseFulfilledHandler, onRejected?: ResponseRejectedHandler): RequestExecutionChainInterface;
}

export interface RequestExecutionChainInterface {
  readonly request: RequestInterceptorRegistration;
  readonly response: ResponseInterceptorRegistration;

  run<T>(operation: RequestOperation<T>): Promise<T>;
  run<T>(options: RequestExecutionOptions, operation: RequestOperation<T>): Promise<T>;
}
