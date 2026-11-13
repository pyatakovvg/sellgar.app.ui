import { Inject, Injectable, Optional } from '../../../di/injection/decorators';
import { LoaderTransaction, LoaderTransactionService } from '../../../controller/runtime/loader-transaction';

export interface CollectionState<TState extends object> {
  get<TKey extends keyof TState>(key: TKey): TState[TKey] | undefined;
  set<TKey extends keyof TState>(key: TKey, value: TState[TKey]): void;
}

export interface Collection<TItem> {
  append(items: readonly TItem[]): TItem[];
}

interface CollectionTask<TItem> {
  readonly revision: number;
  readonly transaction: LoaderTransaction;
  readonly promise: Promise<TItem[]>;
}

@Injectable()
export class Collector<TItem, TState extends object = Record<string, never>> {
  private values: Partial<TState> = {};
  private items: readonly TItem[] = [];
  private acceptedRevision = 0;
  private acceptedCollectionVersion: symbol | undefined;
  private revision = 0;
  private task: CollectionTask<TItem> | undefined;

  constructor(
    @Inject(LoaderTransactionService)
    @Optional()
    private readonly execution?: LoaderTransactionService,
  ) {}

  readonly state: Pick<CollectionState<TState>, 'get'> = {
    get: (key) => (Object.hasOwn(this.values, key) ? this.values[key] : undefined),
  };

  reset(): void {
    this.revision++;
  }

  execute(
    request: (collection: Collection<TItem>, state: CollectionState<TState>) => Promise<TItem[]>,
  ): Promise<TItem[]> {
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
    const values: Partial<TState> = continuing ? { ...this.values } : {};
    let open = true;
    let task: CollectionTask<TItem>;

    const release = (): void => {
      open = false;
      if (this.task === task) this.task = undefined;
    };

    transaction.enlist({
      current: () => this.revision === revision,
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
