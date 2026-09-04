import type { DependencyToken } from '../../../di/token/dependency-token';

export type RevalidateKey = DependencyToken<unknown>;

export interface RevalidateOptions {
  readonly signal?: AbortSignal;
}

export abstract class RevalidateServiceInterface {
  abstract revalidate(options?: RevalidateOptions): Promise<void>;

  abstract revalidate(key: RevalidateKey, options?: RevalidateOptions): Promise<void>;
}
