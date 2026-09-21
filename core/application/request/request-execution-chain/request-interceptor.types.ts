import type { RequestExecutionContext, RequestExecutionOptions } from '../request-executor';

export interface RequestInterceptorContext extends RequestExecutionContext {
  readonly options: Readonly<RequestExecutionOptions>;
}

export type RequestFulfilledHandler<
  TContext extends RequestInterceptorContext = RequestInterceptorContext,
  TNext extends TContext = TContext,
> = (context: TContext) => TNext | Promise<TNext>;

/** A failed preparation may not have produced the extended configuration yet. */
export type RequestRejectedHandler<TContext extends RequestInterceptorContext = RequestInterceptorContext> = (
  error: unknown,
  context: RequestInterceptorContext,
) => TContext | Promise<TContext>;

/** Response handlers preserve the result type of the operation passed to run(). */
export type ResponseFulfilledHandler = <T>(result: T, context: RequestInterceptorContext) => T | Promise<T>;

export type ResponseRejectedHandler = <T>(error: unknown, context: RequestInterceptorContext) => T | Promise<T>;
