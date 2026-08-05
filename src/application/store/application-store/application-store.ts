import { Injectable } from '../../../di/injection/decorators';

import { ApplicationStoreInterface, type ApplicationStoreClassKey } from './application-store.interface.ts';

type ApplicationStoreEntry =
  | {
      readonly kind: 'single';
      readonly value: unknown;
    }
  | {
      readonly kind: 'many';
      readonly values: readonly unknown[];
    };

@Injectable()
export class ApplicationStore extends ApplicationStoreInterface {
  private readonly entries = new Map<ApplicationStoreClassKey<unknown>, ApplicationStoreEntry>();

  clear(): void {
    this.entries.clear();
  }

  delete(key: ApplicationStoreClassKey<unknown>): void {
    this.entries.delete(key);
  }

  get<TValue>(key: ApplicationStoreClassKey<TValue>): TValue | undefined {
    const entry = this.entries.get(key);

    if (!entry || entry.kind !== 'single') {
      return void 0;
    }

    return entry.value as TValue;
  }

  getMany<TValue>(key: ApplicationStoreClassKey<TValue>): TValue[] | undefined {
    const entry = this.entries.get(key);

    if (!entry || entry.kind !== 'many') {
      return void 0;
    }

    return [...entry.values] as TValue[];
  }

  has(key: ApplicationStoreClassKey<unknown>): boolean {
    return this.entries.has(key);
  }

  set<TValue>(key: ApplicationStoreClassKey<TValue>, value: TValue): void {
    this.entries.set(key, {
      kind: 'single',
      value,
    });
  }

  setMany<TValue>(key: ApplicationStoreClassKey<TValue>, values: readonly TValue[]): void {
    this.entries.set(key, {
      kind: 'many',
      values: [...values],
    });
  }
}
