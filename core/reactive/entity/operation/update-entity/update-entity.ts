import { isObservableProp, runInAction } from 'mobx';

import {
  getEntityMetadata,
  isEntityConstructor,
  resolveEntityConstructor,
  type EntityConstructor,
} from '../../declaration/entity';
import { entityRegistry } from '../../runtime/entity-registry';

export const updateEntity = <TEntity extends object>(
  constructor: EntityConstructor<TEntity>,
  data: Partial<TEntity>,
): void => {
  if (!isEntityConstructor(constructor)) {
    throw new Error('Обновить можно только класс, помеченный @Entity().');
  }

  const identityProperty = getEntityMetadata(constructor).identity;
  const identity = Reflect.get(data, identityProperty) as unknown;

  if (typeof identity !== 'string' && typeof identity !== 'number') {
    throw new Error(`Данные обновления не содержат identity: ${String(identityProperty)}.`);
  }

  const entities = entityRegistry.find(resolveEntityConstructor(constructor), identity);

  if (entities.length === 0) {
    return;
  }

  const properties = Object.keys(data);

  for (const property of properties) {
    if (property === identityProperty) {
      continue;
    }

    if (!entities.every((entity) => isObservableProp(entity, property))) {
      throw new Error(`Поле обновления не объявлено в ${constructor.name}: ${property}.`);
    }
  }

  runInAction(() => {
    for (const entity of entities) {
      for (const property of properties) {
        if (property !== identityProperty) {
          Reflect.set(entity, property, Reflect.get(data, property));
        }
      }
    }
  });
};
