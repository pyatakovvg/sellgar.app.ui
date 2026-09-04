import { isObservableProp, makeObservable, observable, observe } from 'mobx';

import type { EntityConstructor } from '../../declaration/entity';
import { entityCollectionRegistry, type EntityCollectionScope } from '../entity-collection-registry';

export const initializeObservableEntityCollection = <TEntity extends object>(
  collection: object,
  entity: EntityConstructor<TEntity>,
  property: string,
  scopeBy?: EntityCollectionScope,
): void => {
  const observableCollection = collection as Record<string, unknown>;

  if (!isObservableProp(observableCollection, property)) {
    makeObservable(observableCollection, {
      [property]: observable.ref,
    });
  }

  registerEntityCollectionInstance(observableCollection, entity, property, scopeBy);
};

const registerEntityCollectionInstance = <TEntity extends object>(
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
