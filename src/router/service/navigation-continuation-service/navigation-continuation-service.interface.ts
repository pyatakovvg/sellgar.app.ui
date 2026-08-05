export interface NavigationContinuationOptions {
  readonly basePath?: string;
  readonly key?: string;
}

export abstract class NavigationContinuationServiceInterface {
  abstract capture(target: string, options?: NavigationContinuationOptions): string | null;

  abstract captureLocation(options?: NavigationContinuationOptions): string | null;

  abstract captureRequest(request: Request, options?: NavigationContinuationOptions): string | null;

  abstract clear(options?: NavigationContinuationOptions): void;

  abstract consume(options?: NavigationContinuationOptions): string | null;
}
