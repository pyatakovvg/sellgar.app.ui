import { Inject, Injectable } from '../../../di/injection/decorators';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { reportRuntimeFailure, RuntimeFailureReporterInterface } from '../../../runtime/failure';
import { executeRuntimeOperation } from '../../../runtime/operation';

import {
  RevalidateServiceInterface,
  type RevalidateHandler,
  type RevalidateKey,
  type RevalidateOptions,
} from '../../contract/revalidate-service';

@Injectable()
export class RevalidateService extends RevalidateServiceInterface {
  private readonly fallbackHandlers = new Set<RevalidateHandler>();
  private readonly handlers = new Map<RevalidateKey, Set<RevalidateHandler>>();

  constructor(
    @Inject(RuntimeFailureReporterInterface)
    private readonly reporter: RuntimeFailureReporterInterface,
  ) {
    super();
  }

  register(key: RevalidateKey, handler: RevalidateHandler): void {
    const handlers = this.handlers.get(key) ?? new Set<RevalidateHandler>();

    handlers.add(handler);
    this.handlers.set(key, handlers);
  }

  registerFallback(handler: RevalidateHandler): void {
    this.fallbackHandlers.add(handler);
  }

  async revalidate(options?: RevalidateOptions): Promise<void>;

  async revalidate(key: RevalidateKey, options?: RevalidateOptions): Promise<void>;

  async revalidate(keyOrOptions?: RevalidateKey | RevalidateOptions, _options?: RevalidateOptions): Promise<void> {
    const key = isRevalidateOptions(keyOrOptions) ? undefined : keyOrOptions;
    const options = isRevalidateOptions(keyOrOptions) ? keyOrOptions : _options;

    if (key !== undefined) {
      const handlers = this.handlers.get(key);

      if (handlers && handlers.size > 0) {
        await this.runHandlers(handlers, options?.signal);
        return;
      }

      await this.runHandlers(this.fallbackHandlers, options?.signal);
      return;
    }

    const handlers = new Set<RevalidateHandler>();

    this.handlers.forEach((item) => {
      item.forEach((handler) => {
        handlers.add(handler);
      });
    });

    if (handlers.size > 0) {
      await this.runHandlers(handlers, options?.signal);
      return;
    }

    await this.runHandlers(this.fallbackHandlers, options?.signal);
  }

  unregister(key: RevalidateKey, handler: RevalidateHandler): void {
    const handlers = this.handlers.get(key);

    if (!handlers) {
      return;
    }

    handlers.delete(handler);

    if (handlers.size === 0) {
      this.handlers.delete(key);
    }
  }

  unregisterFallback(handler: RevalidateHandler): void {
    this.fallbackHandlers.delete(handler);
  }

  private async runHandlers(handlers: Iterable<RevalidateHandler>, signal?: AbortSignal): Promise<void> {
    const handlerList = Array.from(handlers);
    const results = await Promise.all(
      handlerList.map((handler) =>
        executeRuntimeOperation({
          guard: null,
          operation: async () => {
            throwIfAborted(signal);
            await Promise.resolve().then(handler);
            throwIfAborted(signal);
          },
          signal,
          source: {
            operation: 'revalidate',
            owner: { kind: 'application' },
            participant: {
              kind: 'revalidate-handler',
              token: getRevalidateHandlerToken(handler),
            },
          },
        }),
      ),
    );

    for (const result of results) {
      if (result.type === 'failed') {
        const owner = { kind: 'application' } as const;
        await reportRuntimeFailure(this.reporter, result.failure, owner, 'revalidate.failed', 'ready');
      }
    }
  }
}

const isRevalidateOptions = (value: RevalidateKey | RevalidateOptions | undefined): value is RevalidateOptions => {
  return typeof value === 'object' && value !== null;
};

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) {
    throw new Error('Revalidate был прерван.');
  }
};

const getRevalidateHandlerToken = (handler: RevalidateHandler | undefined): DependencyToken<unknown> => {
  return (handler ?? RevalidateService) as DependencyToken<unknown>;
};
