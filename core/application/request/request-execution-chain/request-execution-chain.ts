import type { RequestExecutionOptions, RequestOperation } from '../request-executor';
import type {
  RequestExecutionChainInterface,
  RequestInterceptorRegistration,
  ResponseInterceptorRegistration,
} from './request-execution-chain.interface.ts';
import { RequestInterceptorPipeline } from './request-interceptor-pipeline.ts';

export type RequestChainSubmission = <T>(
  options: RequestExecutionOptions,
  operation: RequestOperation<T>,
  interceptors: RequestInterceptorPipeline,
) => Promise<T>;

export class RequestExecutionChain implements RequestExecutionChainInterface {
  readonly request: RequestInterceptorRegistration = {
    use: (onFulfilled, onRejected) =>
      new RequestExecutionChain(this.submit, this.interceptors.withRequest(onFulfilled, onRejected)),
  };

  readonly response: ResponseInterceptorRegistration = {
    use: (onFulfilled, onRejected) =>
      new RequestExecutionChain(this.submit, this.interceptors.withResponse(onFulfilled, onRejected)),
  };

  constructor(
    private readonly submit: RequestChainSubmission,
    private readonly interceptors = new RequestInterceptorPipeline(),
  ) {}

  run<T>(operation: RequestOperation<T>): Promise<T>;
  run<T>(options: RequestExecutionOptions, operation: RequestOperation<T>): Promise<T>;
  run<T>(
    optionsOrOperation: RequestExecutionOptions | RequestOperation<T>,
    maybeOperation?: RequestOperation<T>,
  ): Promise<T> {
    const options = typeof optionsOrOperation === 'function' ? {} : optionsOrOperation;
    const operation = typeof optionsOrOperation === 'function' ? optionsOrOperation : maybeOperation;

    if (!operation) {
      throw new Error('Операция запроса обязательна.');
    }

    return this.submit(options, operation, this.interceptors);
  }
}
