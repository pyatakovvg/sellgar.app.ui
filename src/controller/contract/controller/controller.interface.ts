export type ControllerArgs<TArgs extends object = object> = TArgs & {
  readonly signal: AbortSignal;
};

export type WithParams<TParams, TNext extends object = object> = TNext & {
  readonly params: TParams;
};

export type WithPayload<TPayload, TNext extends object = object> = TNext & {
  readonly payload: TPayload;
};

export type WithProps<TProps extends object, TNext extends object = object> = TNext & {
  readonly props: TProps;
};

interface ControllerRuntimeContract {
  action?(args: ControllerArgs<WithPayload<unknown>>): unknown | Promise<unknown>;

  dispose?(): void | Promise<void>;

  loader?(args: ControllerArgs): unknown | Promise<unknown>;
}

export type RuntimeController = ControllerRuntimeContract;

export type ControllerLoaderResult<TController> = TController extends {
  loader: (...args: infer _TArgs) => infer TResult;
}
  ? Awaited<TResult>
  : never;

export type ControllerActionPayload<TController> = TController extends { action: infer TAction }
  ? TAction extends (args: infer TArgs) => unknown
    ? TArgs extends { readonly payload: infer TPayload }
      ? TPayload
      : never
    : never
  : never;

export type ControllerActionResult<TController> = TController extends {
  action: (...args: infer _TArgs) => infer TResult;
}
  ? Awaited<TResult>
  : never;
