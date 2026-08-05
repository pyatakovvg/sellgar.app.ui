import { Inject, Injectable } from '../../../di/injection/decorators';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { captureRuntimeFailure, reportRuntimeFailure, RuntimeFailureReporterInterface } from '../../../runtime/failure';

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

    if (key !== undefined) {
      const handlers = this.handlers.get(key);

      if (handlers && handlers.size > 0) {
        await this.runHandlers(handlers);
        return;
      }

      await this.runHandlers(this.fallbackHandlers);
      return;
    }

    const handlers = new Set<RevalidateHandler>();

    this.handlers.forEach((item) => {
      item.forEach((handler) => {
        handlers.add(handler);
      });
    });

    if (handlers.size > 0) {
      await this.runHandlers(handlers);
      return;
    }

    await this.runHandlers(this.fallbackHandlers);
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

  private async runHandlers(handlers: Iterable<RevalidateHandler>): Promise<void> {
    const handlerList = Array.from(handlers);
    const results = await Promise.allSettled(
      handlerList.map((handler) => {
        return Promise.resolve().then(handler);
      }),
    );

    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        const owner = { kind: 'application' } as const;
        const failure = captureRuntimeFailure(result.reason, {
          operation: 'revalidate',
          owner,
          participant: {
            kind: 'revalidate-handler',
            token: getRevalidateHandlerToken(handlerList[index]),
          },
        });

        await reportRuntimeFailure(this.reporter, failure, owner, 'revalidate.failed', 'ready');
      }
    }
  }
}

const isRevalidateOptions = (value: RevalidateKey | RevalidateOptions | undefined): value is RevalidateOptions => {
  return typeof value === 'object' && value !== null && 'signal' in value;
};

const getRevalidateHandlerToken = (handler: RevalidateHandler | undefined): DependencyToken<unknown> => {
  return (handler ?? RevalidateService) as DependencyToken<unknown>;
};
