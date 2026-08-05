export type ApplicationStoreClassKey<TValue> = abstract new (...args: never[]) => TValue;

export abstract class ApplicationStoreInterface {
  abstract clear(): void;

  abstract delete(key: ApplicationStoreClassKey<unknown>): void;

  abstract get<TValue>(key: ApplicationStoreClassKey<TValue>): TValue | undefined;

  abstract getMany<TValue>(key: ApplicationStoreClassKey<TValue>): TValue[] | undefined;

  abstract has(key: ApplicationStoreClassKey<unknown>): boolean;

  abstract set<TValue>(key: ApplicationStoreClassKey<TValue>, value: TValue): void;

  abstract setMany<TValue>(key: ApplicationStoreClassKey<TValue>, values: readonly TValue[]): void;
}
