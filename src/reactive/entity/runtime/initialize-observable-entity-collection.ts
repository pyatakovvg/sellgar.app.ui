import { isObservableProp, makeObservable, observable } from 'mobx';

import type { EntityConstructor } from '../declaration';

import { registerEntityCollectionInstance } from './entity-collection-registration.ts';
import type { EntityCollectionScope } from './entity-collection-registry.ts';

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
