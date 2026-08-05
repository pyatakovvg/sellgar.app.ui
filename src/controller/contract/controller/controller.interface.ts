export interface ControllerLoaderArgs {
  readonly params: Record<string, string | undefined>;
  readonly request: Request;
}

export interface ControllerActionArgs<TPayload = unknown> {
  readonly params: Record<string, string | undefined>;
  readonly payload: TPayload;
  readonly request: Request;
}

export interface ControllerInterface {
  action?(args: ControllerActionArgs): unknown | Promise<unknown>;

  dispose?(): void | Promise<void>;

  loader?(args: ControllerLoaderArgs): unknown | Promise<unknown>;
}

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
