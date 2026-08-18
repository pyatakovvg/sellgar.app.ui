import type { DependencyToken } from '../../../di/token/dependency-token';

export type RevalidateKey = DependencyToken<unknown>;
export type RevalidateHandler = () => void | Promise<void>;

export interface RevalidateOptions {
  readonly signal?: AbortSignal;
}

export abstract class RevalidateServiceInterface {
  abstract revalidate(options?: RevalidateOptions): Promise<void>;

  abstract revalidate(key: RevalidateKey, options?: RevalidateOptions): Promise<void>;
}

export abstract class RevalidateRegistryInterface {
  abstract register(key: RevalidateKey, handler: RevalidateHandler): void;

  abstract registerFallback(handler: RevalidateHandler): void;

  abstract unregister(key: RevalidateKey, handler: RevalidateHandler): void;

  abstract unregisterFallback(handler: RevalidateHandler): void;
}
