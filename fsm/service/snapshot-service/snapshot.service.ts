import { Inject, Injectable } from '../../../core/di/injection/decorators';
import { LocationServiceInterface } from '../../../core/router/service/location-service';
import type { SnapshotServiceInterface } from './snapshot-service.interface';

@Injectable()
export class SnapshotService implements SnapshotServiceInterface {
  constructor(@Inject(LocationServiceInterface) private readonly location: LocationServiceInterface) {}

  subscribe<TValue extends object>(token: new () => TValue, listener: (value: TValue | null) => void): () => void {
    return this.location.subscribe(() => listener(this.get(token)));
  }

  get<TValue extends object>(token: new () => TValue): TValue | null {
    const pending: unknown[] = [this.location.location?.state];
    const visited = new WeakSet<object>();
    let result: TValue | null = null;

    while (pending.length > 0) {
      const value = pending.pop();
      if (value === null || typeof value !== 'object' || visited.has(value)) continue;
      visited.add(value);

      if (value instanceof token && Object.getPrototypeOf(value) === token.prototype) {
        if (result !== null) {
          throw new Error(`Snapshot содержит несколько экземпляров ${token.name}. Токен должен быть однозначным.`);
        }
        result = value;
      }

      // Read stored data only: snapshot access must not execute computed getters.
      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
        if (descriptor.enumerable && 'value' in descriptor) pending.push(descriptor.value);
      }
    }

    return result;
  }
}
