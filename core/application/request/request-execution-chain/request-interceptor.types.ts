import type { RequestExecutionContext, RequestExecutionOptions } from '../request-executor';

export interface RequestInterceptorContext extends RequestExecutionContext {
  readonly options: Readonly<RequestExecutionOptions>;
}

export type RequestFulfilledHandler = (context: RequestInterceptorContext) => void | Promise<void>;

export type RequestRejectedHandler = (error: unknown, context: RequestInterceptorContext) => void | Promise<void>;

/** Response handlers preserve the result type of the operation passed to run(). */
export type ResponseFulfilledHandler = <T>(result: T, context: RequestInterceptorContext) => T | Promise<T>;

export type ResponseRejectedHandler = <T>(error: unknown, context: RequestInterceptorContext) => T | Promise<T>;
