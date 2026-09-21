import {
  type RequestExecutionChainInterface,
  type RequestExecutorInterface,
  type RequestInterceptorContext,
  type ResponseFulfilledHandler,
  type ResponseRejectedHandler,
} from '@sellgar/app';

export function verifyRequestExecutorContract(executor: RequestExecutorInterface) {
  const before = async (context: RequestInterceptorContext): Promise<RequestInterceptorContext> => {
    void context.signal.aborted;
    void context.options.scope;

    // @ts-expect-error Interceptors cannot replace the executor's cancellation signal.
    context.signal = new AbortController().signal;
    // @ts-expect-error Queue options are a read-only snapshot, not scheduling controls.
    context.options.priority = 100;
    return context;
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
  // @ts-expect-error Request callbacks must return a configuration, not an operation result.
  executor.request.use(() => 'result');

  // @ts-expect-error A request callback must explicitly return its configuration.
  executor.request.use(() => {});

  const extended = executor.request
    .use((config) => ({ ...config, accessToken: 'example' }))
    .request.use(async (config) => ({ ...config, authorization: `Bearer ${config.accessToken}` }))
    .run(async ({ authorization }) => authorization);
  const typed: Promise<string> = extended;

  const recovered: Promise<number> = executor.request
    .use((config) => ({ ...config, page: 1 }))
    .request.use((config): typeof config => {
      throw new Error('prepare');
    })
    .request.use(undefined, (_error, config) => ({ ...config, page: 2 }))
    .run(async ({ page }) => page);

  // @ts-expect-error Calling use without a transformation cannot invent configuration fields.
  executor.request.use<RequestInterceptorContext & { page: number }>();

  executor.request
    .use((config) => ({ ...config, accessToken: 'example' }))
    .request.use(
      // @ts-expect-error A later transformation must preserve fields promised by the previous stage.
      ({ signal, options }) => ({ signal, options }),
    );

  return { configured, direct, responseOnly, typed, recovered };
}
