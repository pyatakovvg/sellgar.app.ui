import { runInAction } from 'mobx';

import {
  getEntityIdentity,
  getEntityMetadata,
  isEntityConstructor,
  type EntityConstructor,
} from '../../declaration/entity';
import { entityCollectionRegistry } from '../../runtime/entity-collection-registry';

export const removeEntity = <TEntity extends object>(
  constructor: EntityConstructor<TEntity>,
  identityData: Partial<TEntity>,
): void => {
  if (!isEntityConstructor(constructor)) {
    throw new Error('Удалить можно только экземпляры класса, помеченного @Entity().');
  }

  const identityProperty = getEntityMetadata(constructor).identity;
  const identity = Reflect.get(identityData, identityProperty) as unknown;

  if (typeof identity !== 'string' && typeof identity !== 'number') {
    throw new Error(`Данные удаления не содержат identity: ${String(identityProperty)}.`);
  }

  const updates = entityCollectionRegistry
    .find(constructor)
    .map(({ collection, property }) => {
      const items = Reflect.get(collection, property) as unknown;

      if (!Array.isArray(items)) {
        throw new Error(`Поле reactive entity collection не является массивом: ${property}.`);
      }

      const retainedItems = items.filter((item) => getEntityIdentity(item as TEntity) !== identity);

      if (retainedItems.length === items.length) {
        return undefined;
      }

      return { collection, items: retainedItems, property };
    })
    .filter((update) => update !== undefined);

  runInAction(() => {
    for (const update of updates) {
      Reflect.set(update.collection, update.property, update.items);
    }
  });
};
