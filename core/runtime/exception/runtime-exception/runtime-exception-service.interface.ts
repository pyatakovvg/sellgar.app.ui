export abstract class RuntimeExceptionServiceInterface {
  abstract raise(error: unknown): never;
}
