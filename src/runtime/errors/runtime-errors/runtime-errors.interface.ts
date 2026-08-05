export type RuntimeErrorHandler<TError = unknown> = (error: TError) => void | Promise<void>;
export type RuntimeErrorConstructor<TError extends Error = Error> = new (...args: any[]) => TError;

export abstract class RuntimeErrorsInterface {
  abstract emit(error: unknown): Promise<void>;

  abstract on<TError extends Error>(
    errorType: RuntimeErrorConstructor<TError>,
    handler: RuntimeErrorHandler<TError>,
  ): () => void;

  abstract subscribe(handler: RuntimeErrorHandler): () => void;
}
