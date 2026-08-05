export interface FrameControllerLoaderArgs<TProps extends object = Record<string, never>> {
  readonly params: Record<string, string | undefined>;
  readonly props: TProps;
  readonly request: Request;
  readonly signal: AbortSignal;
}

export interface FrameControllerActionArgs<TProps extends object = Record<string, never>, TPayload = unknown> {
  readonly params: Record<string, string | undefined>;
  readonly payload: TPayload;
  readonly props: TProps;
  readonly request: Request;
  readonly signal: AbortSignal;
}

export abstract class FrameControllerInterface<TProps extends object = Record<string, never>> {
  action?(args: FrameControllerActionArgs<TProps>): unknown | Promise<unknown>;

  dispose?(): void | Promise<void>;

  loader?(args: FrameControllerLoaderArgs<TProps>): unknown | Promise<unknown>;
}

export type FrameControllerActionPayload<TController> = TController extends {
  action: (args: FrameControllerActionArgs<infer _TProps, infer TPayload>) => unknown;
}
  ? TPayload
  : never;

export type FrameControllerActionResult<TController> = TController extends {
  action: (...args: infer _TArgs) => infer TResult;
}
  ? Awaited<TResult>
  : never;

export type FrameControllerLoaderResult<TController> = TController extends {
  loader: (...args: infer _TArgs) => infer TResult;
}
  ? Awaited<TResult>
  : never;
