import {
  type RequestExecutionChainInterface,
  type RequestExecutorInterface,
  type RequestInterceptorContext,
  type ResponseFulfilledHandler,
  type ResponseRejectedHandler,
} from '@sellgar/app';

export function verifyRequestExecutorContract(executor: RequestExecutorInterface) {
  const before = async (context: RequestInterceptorContext): Promise<void> => {
    void context.signal.aborted;
    void context.options.scope;

    // @ts-expect-error Interceptors cannot replace the executor's cancellation signal.
    context.signal = new AbortController().signal;
    // @ts-expect-error Queue options are a read-only snapshot, not scheduling controls.
    context.options.priority = 100;
  };

  const after: ResponseFulfilledHandler = (value) => value;
  const reject: ResponseRejectedHandler = (error) => {
    throw error;
  };

  const chain: RequestExecutionChainInterface = executor.request.use(before).response.use(after, reject);
  const configured: Promise<{ id: string }> = chain.run({ scope: 'profile:get' }, async () => ({ id: 'profile' }));
  const direct: Promise<number> = executor.run(async () => 42);
  const responseOnly: Promise<string> = executor.response.use(undefined, reject).run(async () => 'result');

  // @ts-expect-error A generic response interceptor cannot silently change the operation's result type.
  executor.response.use(() => 'unrelated result');
  // @ts-expect-error Request callbacks prepare an operation; they do not replace its result.
  executor.request.use(() => 'result');

  return { configured, direct, responseOnly };
}
