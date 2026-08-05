import { observe } from 'mobx';

import type { EntityConstructor } from '../declaration';

import { entityCollectionRegistry, type EntityCollectionScope } from './entity-collection-registry.ts';

export const registerEntityCollectionInstance = <TEntity extends object>(
  collection: Record<string, unknown>,
  entity: EntityConstructor<TEntity>,
  property: string,
  scopeBy?: EntityCollectionScope,
): void => {
  let registered = false;

  const register = (value: unknown): void => {
    if (registered || !Array.isArray(value)) {
      return;
    }

    registered = true;
    entityCollectionRegistry.register(entity, property, collection, scopeBy);
  };

  register(Reflect.get(collection, property));

  if (registered) {
    return;
  }

  const disposeObservation = observe(collection, property, (change) => {
    register(change.newValue);

    if (registered) {
      disposeObservation();
    }
  });
};
