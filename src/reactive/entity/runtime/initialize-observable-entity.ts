import { isObservableProp, makeObservable, observable } from 'mobx';

import type { EntityConstructor } from '../declaration';

import { registerEntityInstance } from './entity-registration';

export const initializeObservableEntity = <TEntity extends object>(
  entity: TEntity,
  constructor: EntityConstructor<TEntity>,
  identityProperty: PropertyKey,
): void => {
  const observableEntity = entity as Record<string, unknown>;
  const properties = Object.keys(entity).filter((property) => !isObservableProp(observableEntity, property));
  const annotations = Object.fromEntries(properties.map((property) => [property, observable.ref]));

  if (properties.length > 0) {
    makeObservable(observableEntity, annotations);
  }

  registerEntityInstance(constructor, entity, identityProperty);
};
