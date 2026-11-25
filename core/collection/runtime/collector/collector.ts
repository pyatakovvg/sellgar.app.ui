import { Inject, Injectable, Optional } from '../../../di/injection/decorators';
import { LoaderTransaction, LoaderTransactionService } from '../../../controller/runtime/loader-transaction';
import { CollectorContext } from '../collector-context';
import type { Collection, CollectionState, CollectorInterface } from './collector.interface.ts';

interface CollectionTask<TItem> {
  readonly revision: number;
  readonly transaction: LoaderTransaction;
  readonly promise: Promise<TItem[]>;
}

@Injectable()
export class Collector<TItem, TState extends object = Record<string, never>> implements CollectorInterface<
  TItem,
  TState
> {
  private values: Partial<TState> = {};
  private items: readonly TItem[] = [];
  private acceptedRevision = 0;
  private acceptedCollectionVersion: symbol | undefined;
  private revision = 0;
  private task: CollectionTask<TItem> | undefined;
  private disposed = false;
  private unregister: (() => void) | undefined;

  constructor(execution?: LoaderTransactionService);
  constructor(
    @Inject(LoaderTransactionService)
    @Optional()
    private readonly execution?: LoaderTransactionService,
    @Inject(CollectorContext)
    @Optional()
    context?: CollectorContext,
  ) {
    if (context) {
      context.owner.own({ revoke: () => this.dispose() });
      if (context.key === undefined) throw new Error('A controller-owned collector requires a key.');
      this.unregister = context.registry.register(context.key, this);
    }
  }

  readonly state: Pick<CollectionState<TState>, 'get'> = {
    get: (key) => {
      this.assertActive();
      return Object.hasOwn(this.values, key) ? this.values[key] : undefined;
    },
  };

  reset(): void {
    this.assertActive();
    this.revision++;
    this.task?.transaction.cancel();
  }

  private dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.revision++;
    this.unregister?.();
    this.unregister = undefined;
    this.task?.transaction.cancel();
    this.task = undefined;
    this.items = [];
    this.values = {};
    this.acceptedCollectionVersion = undefined;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Collector owner has been released.');
  }

  execute(
    request: (collection: Collection<TItem>, state: CollectionState<TState>) => Promise<TItem[]>,
  ): Promise<TItem[]> {
    this.assertActive();
    const runtimeTransaction = this.execution?.requireCurrent();

    if (
      this.task?.revision === this.revision &&
      (!runtimeTransaction || this.task.transaction === runtimeTransaction)
    ) {
      return this.task.promise;
    }

    const transaction = runtimeTransaction ?? new LoaderTransaction();
    const revision = this.revision;
    const collectionVersion = transaction.collection?.version;
    const continuing = this.acceptedRevision === revision && this.acceptedCollectionVersion === collectionVersion;
    let items = continuing ? this.items : [];
    let values: Partial<TState> = continuing ? { ...this.values } : {};
    let open = true;
    let task: CollectionTask<TItem>;

    const release = (): void => {
      open = false;
      if (this.task === task) this.task = undefined;
      items = [];
      values = {};
    };

    transaction.enlist({
      current: () => !this.disposed && this.revision === revision,
      commit: () => {
        this.items = items;
        this.values = values;
        this.acceptedRevision = revision;
        this.acceptedCollectionVersion = collectionVersion;
        release();
      },
      discard: release,
    });

    const collection: Collection<TItem> = {
      append: (page) => {
        transaction.assertCurrent();
        if (!open) throw new Error('Запрос коллекции уже завершён.');

        items = [...items, ...page];
        return [...items];
      },
    };

    const state: CollectionState<TState> = {
      get: (key) => (Object.hasOwn(values, key) ? values[key] : undefined),
      set: (key, value) => {
        transaction.assertCurrent();
        if (!open) throw new Error('Запрос коллекции уже завершён.');
        Object.defineProperty(values, key, { value, enumerable: true, configurable: true, writable: true });
      },
    };

    const promise = Promise.resolve().then(async () => {
      try {
        transaction.assertCurrent();
        const result = await request(collection, state);
        transaction.assertCurrent();
        open = false;

        if (!runtimeTransaction) transaction.commit();

        return result;
      } catch (error) {
        transaction.discard();
        throw error;
      }
    });

    task = { revision, transaction, promise };
    this.task = task;
    return promise;
  }
}
