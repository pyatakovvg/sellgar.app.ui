import type { ControllerLoaderData } from '../../data/controller-loader-data';
import { createRuntimeInterruption } from '../../../runtime/operation/runtime-interruption';
import type { RuntimeExecution } from '../../../runtime/operation/runtime-execution';

interface LoaderCollectionContext {
  readonly version: symbol;
  current(): boolean;
}

interface LoaderTransactionParticipant {
  current(): boolean;
  commit(): void;
  discard(): void;
}

const transactions = new WeakMap<ControllerLoaderData, LoaderTransaction>();

export class LoaderTransaction {
  private readonly participants = new Set<LoaderTransactionParticipant>();
  private interrupt!: () => void;
  readonly interrupted = new Promise<never>((_, reject) => {
    this.interrupt = () => reject(createRuntimeInterruption(undefined, 'request-cancelled'));
  });
  private phase: 'pending' | 'committed' | 'discarded' = 'pending';

  constructor(
    private readonly signal?: AbortSignal,
    private readonly finish?: () => void,
    readonly execution?: RuntimeExecution,
    readonly collection?: LoaderCollectionContext,
  ) {
    void this.interrupted.catch(() => undefined);
    signal?.addEventListener('abort', this.cancel, { once: true });
  }

  enlist(participant: LoaderTransactionParticipant): void {
    this.assertCurrent();
    this.participants.add(participant);
  }

  assertCurrent(): void {
    if (
      this.phase !== 'pending' ||
      this.signal?.aborted ||
      this.collection?.current() === false ||
      [...this.participants].some((item) => !item.current())
    ) {
      throw createRuntimeInterruption(new Error('Результат loader больше не актуален.'), 'request-cancelled');
    }
  }

  commit(): boolean {
    if (this.phase !== 'pending') return this.phase === 'committed';

    if (
      this.signal?.aborted ||
      this.collection?.current() === false ||
      [...this.participants].some((item) => !item.current())
    ) {
      this.discard();
      return false;
    }

    this.phase = 'committed';
    this.signal?.removeEventListener('abort', this.cancel);

    for (const participant of this.participants) participant.commit();

    this.participants.clear();
    this.finish?.();
    return true;
  }

  readonly cancel = (): void => {
    if (this.phase === 'committed') return;
    this.discard();
    this.interrupt();
  };

  readonly discard = (): void => {
    if (this.phase !== 'pending') return;

    this.phase = 'discarded';
    this.signal?.removeEventListener('abort', this.cancel);

    for (const participant of this.participants) participant.discard();

    this.participants.clear();
    this.finish?.();
  };
}

export class LoaderTransactionService {
  private active: LoaderTransaction | undefined;
  private collectionVersion = Symbol();
  private disposed = false;
  private queue: Promise<void> = Promise.resolve();
  private readonly pending = new Set<LoaderTransaction>();

  restartCollections(): void {
    this.collectionVersion = Symbol();
    this.active?.cancel();
    for (const transaction of this.pending) transaction.cancel();
  }

  requireCurrent(): LoaderTransaction {
    if (!this.active) {
      throw createRuntimeInterruption(new Error('Выполнение loader больше не активно.'), 'request-cancelled');
    }

    this.active.assertCurrent();
    return this.active;
  }

  discardCurrent(): void {
    this.active?.cancel();
    this.active = undefined;
  }

  run(
    signal: AbortSignal,
    load: () => Promise<ControllerLoaderData>,
    execution?: RuntimeExecution,
  ): Promise<ControllerLoaderData> {
    const version = this.collectionVersion;
    const task = this.queue.then(() => this.execute(signal, load, execution, version));
    this.queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private async execute(
    signal: AbortSignal,
    load: () => Promise<ControllerLoaderData>,
    execution: RuntimeExecution | undefined,
    version: symbol,
  ): Promise<ControllerLoaderData> {
    if (this.disposed || signal.aborted || version !== this.collectionVersion) {
      throw createRuntimeInterruption(new Error('Выполнение loader отменено.'), 'request-cancelled');
    }

    const transaction = new LoaderTransaction(signal, () => this.pending.delete(transaction), execution, {
      version,
      current: () => version === this.collectionVersion,
    });
    this.active = transaction;
    this.pending.add(transaction);
    const abort = (): void => transaction.cancel();
    signal.addEventListener('abort', abort, { once: true });

    try {
      const data = await Promise.race([load(), transaction.interrupted]);
      transaction.assertCurrent();
      transactions.set(data, transaction);
      return data;
    } catch (error) {
      transaction.discard();
      this.pending.delete(transaction);
      throw error;
    } finally {
      signal.removeEventListener('abort', abort);
      if (this.active === transaction) this.active = undefined;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.active?.cancel();
    for (const transaction of this.pending) transaction.cancel();

    this.pending.clear();
    this.active = undefined;
  }
}

export const commitLoaderData = (data: ControllerLoaderData): boolean => {
  const transaction = transactions.get(data);
  transactions.delete(data);
  return transaction?.commit() ?? true;
};

export const discardLoaderData = (data: ControllerLoaderData): void => {
  transactions.get(data)?.discard();
  transactions.delete(data);
};

export const settleLoaderTasks = async <const TTasks extends readonly unknown[]>(tasks: TTasks) => {
  try {
    return await Promise.all(tasks);
  } catch (error) {
    await Promise.allSettled(tasks);
    throw error;
  }
};
