export interface WidgetControllerLoaderArgs<TProps extends object = Record<string, never>> {
  readonly props: TProps;
  readonly signal: AbortSignal;
}

export interface WidgetControllerActionArgs<TProps extends object = Record<string, never>, TPayload = unknown> {
  readonly payload: TPayload;
  readonly props: TProps;
  readonly signal: AbortSignal;
}

export abstract class WidgetControllerInterface<TProps extends object = Record<string, never>> {
  action?(args: WidgetControllerActionArgs<TProps>): unknown | Promise<unknown>;

  dispose?(): void | Promise<void>;

  loader?(args: WidgetControllerLoaderArgs<TProps>): unknown | Promise<unknown>;
}

export type WidgetControllerActionPayload<TController> = TController extends {
  action: (args: WidgetControllerActionArgs<infer _TProps, infer TPayload>) => unknown;
}
  ? TPayload
  : never;

export type WidgetControllerActionResult<TController> = TController extends {
  action: (...args: infer _TArgs) => infer TResult;
}
  ? Awaited<TResult>
  : never;

export type WidgetControllerLoaderResult<TController> = TController extends {
  loader: (...args: infer _TArgs) => infer TResult;
}
  ? Awaited<TResult>
  : never;
