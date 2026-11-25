export interface CollectionState<TState extends object> {
  get<TKey extends keyof TState>(key: TKey): TState[TKey] | undefined;
  set<TKey extends keyof TState>(key: TKey, value: TState[TKey]): void;
}

export interface Collection<TItem> {
  append(items: readonly TItem[]): TItem[];
}

export abstract class CollectorInterface<TItem, TState extends object = Record<string, never>> {
  abstract readonly state: Pick<CollectionState<TState>, 'get'>;

  abstract reset(): void;

  abstract execute(
    request: (collection: Collection<TItem>, state: CollectionState<TState>) => Promise<TItem[]>,
  ): Promise<TItem[]>;
}
