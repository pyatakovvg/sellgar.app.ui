import { intercept, isObservableProp, makeObservable, observable, observe } from 'mobx';

import type { EntityConstructor, EntityIdentity } from '../../declaration/entity';
import { entityRegistry } from '../entity-registry';

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

const registerEntityInstance = <TEntity extends object>(
  constructor: EntityConstructor<TEntity>,
  entity: TEntity,
  identityProperty: PropertyKey,
): void => {
  const observableEntity = entity as Record<PropertyKey, unknown>;
  let identity: EntityIdentity | undefined;

  const register = (value: unknown): void => {
    if (!isEntityIdentity(value)) {
      return;
    }

    identity = value;
    entityRegistry.register(constructor, value, entity);
  };

  register(Reflect.get(observableEntity, identityProperty));

  intercept(observableEntity, identityProperty, (change) => {
    if (change.newValue !== undefined && !isEntityIdentity(change.newValue)) {
      throw new Error(`Identity реактивной сущности должен быть строкой или числом: ${String(identityProperty)}.`);
    }

    if (identity !== undefined && change.newValue !== identity) {
      throw new Error(`Identity реактивной сущности нельзя изменить: ${String(identityProperty)}.`);
    }

    return change;
  });

  observe(observableEntity, identityProperty, (change) => {
    if (identity === undefined) {
      register(change.newValue);
    }
  });
};

const isEntityIdentity = (value: unknown): value is EntityIdentity => {
  return typeof value === 'string' || typeof value === 'number';
};
