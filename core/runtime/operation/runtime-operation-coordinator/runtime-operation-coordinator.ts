import type { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';

type RuntimeRefresh = () => void | Promise<void>;

interface RefreshWaiter {
  readonly reject: (error: unknown) => void;
  readonly resolve: () => void;
  readonly revision: number;
}

export class RuntimeOperationCoordinator {
  private completedRevision = 0;
  private invalidationRevision = 0;
  private refresh: RuntimeRefresh | null = null;
  private refreshPromise: Promise<void> | null = null;
  private refreshScheduled = false;
  private unsubscribeSession: (() => void) | null = null;
  private readonly waiters = new Set<RefreshWaiter>();

  constructor(session: SessionRuntimeStateInterface) {
    this.unsubscribeSession = session.subscribe(() => {
      this.invalidate();
    });
  }

  attachRefresh(refresh: RuntimeRefresh): () => void {
    if (this.refresh !== null) {
      throw new Error('Обработчик обновления runtime уже подключён.');
    }

    this.completedRevision = this.invalidationRevision;
    this.refresh = refresh;

    return () => {
      if (this.refresh !== refresh) {
        return;
      }

      this.refresh = null;
      this.resolveWaiters(this.invalidationRevision);
    };
  }

  invalidate(): number {
    this.invalidationRevision += 1;
    this.scheduleRefresh();
    return this.invalidationRevision;
  }

  invalidateAndWait(): Promise<void> {
    return this.waitFor(this.invalidate());
  }

  run<TValue>(operation: () => TValue): TValue {
    const initialRevision = this.invalidationRevision;

    try {
      const value = operation();

      if (isPromiseLike(value)) {
        return value.then(
          async (result) => {
            await this.waitForOperationInvalidations(initialRevision);
            return result;
          },
          async (error) => {
            await this.waitForOperationInvalidations(initialRevision);
            throw error;
          },
        ) as TValue;
      }

      return value;
    } catch (error) {
      throw error;
    }
  }

  dispose(): void {
    this.unsubscribeSession?.();
    this.unsubscribeSession = null;
    this.refresh = null;
    this.refreshScheduled = false;
    this.resolveWaiters(this.invalidationRevision);
  }

  private async flush(): Promise<void> {
    this.refreshScheduled = false;

    if (this.refreshPromise !== null || this.refresh === null || this.completedRevision >= this.invalidationRevision) {
      return;
    }

    const refresh = this.refresh;
    const revision = this.invalidationRevision;

    this.refreshPromise = Promise.resolve(refresh())
      .then(() => {
        this.completedRevision = revision;
        this.resolveWaiters(revision);
      })
      .catch((error) => {
        this.completedRevision = revision;
        this.rejectWaiters(revision, error);
      })
      .finally(() => {
        this.refreshPromise = null;
        this.scheduleRefresh();
      });

    await this.refreshPromise;
  }

  private scheduleRefresh(): void {
    if (
      this.refreshScheduled ||
      this.refreshPromise !== null ||
      this.refresh === null ||
      this.completedRevision >= this.invalidationRevision
    ) {
      return;
    }

    this.refreshScheduled = true;
    queueMicrotask(() => {
      void this.flush();
    });
  }

  private waitFor(revision: number): Promise<void> {
    if (revision <= this.completedRevision || this.refresh === null) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      this.waiters.add({ reject, resolve, revision });
    });
  }

  private waitForOperationInvalidations(initialRevision: number): Promise<void> {
    const revision = this.invalidationRevision;

    return revision > initialRevision ? this.waitFor(revision) : Promise.resolve();
  }

  private resolveWaiters(revision: number): void {
    this.waiters.forEach((waiter) => {
      if (waiter.revision <= revision) {
        this.waiters.delete(waiter);
        waiter.resolve();
      }
    });
  }

  private rejectWaiters(revision: number, error: unknown): void {
    this.waiters.forEach((waiter) => {
      if (waiter.revision <= revision) {
        this.waiters.delete(waiter);
        waiter.reject(error);
      }
    });
  }
}

const isPromiseLike = <TValue>(value: TValue): value is TValue & Promise<Awaited<TValue>> => {
  return (
    ((typeof value === 'object' && value !== null) || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  );
};
