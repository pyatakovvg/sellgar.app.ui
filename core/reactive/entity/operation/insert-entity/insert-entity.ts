import { runInAction } from 'mobx';

import { getEntityIdentity, isEntityConstructor, type EntityConstructor } from '../../declaration/entity';
import { entityCollectionRegistry } from '../../runtime/entity-collection-registry';
import { updateEntity } from '../update-entity';

export interface InsertEntityOptions {
  readonly position?: 'end' | 'start';
}

export const insertEntity = <TEntity extends object>(
  constructor: EntityConstructor<TEntity>,
  entity: TEntity,
  options: InsertEntityOptions = {},
): void => {
  if (!isEntityConstructor(constructor)) {
    throw new Error('Добавить можно только экземпляр класса, помеченного @Entity().');
  }

  if (!(entity instanceof constructor)) {
    throw new Error(`Добавляемое значение не является экземпляром ${constructor.name}.`);
  }

  const identity = getEntityIdentity(entity);

  updateEntity(constructor, entity);

  const updates = entityCollectionRegistry
    .find(constructor)
    .map(({ collection, property, scopeBy }) => {
      if (
        scopeBy &&
        getScope(collection, scopeBy.owner, 'Reactive entity collection') !==
          getScope(entity, scopeBy.entity, constructor.name)
      ) {
        return undefined;
      }

      const items = Reflect.get(collection, property) as unknown;

      if (!Array.isArray(items)) {
        throw new Error(`Поле reactive entity collection не является массивом: ${property}.`);
      }

      if (items.some((item) => getEntityIdentity(item as TEntity) === identity)) {
        return undefined;
      }

      return {
        collection,
        items: options.position === 'start' ? [entity, ...items] : [...items, entity],
        property,
      };
    })
    .filter((update) => update !== undefined);

  runInAction(() => {
    for (const update of updates) {
      Reflect.set(update.collection, update.property, update.items);
    }
  });
};

const getScope = (target: object, scopeBy: string, targetName: string): string | number => {
  const scope = Reflect.get(target, scopeBy) as unknown;

  if (typeof scope !== 'string' && typeof scope !== 'number') {
    throw new Error(`${targetName} не содержит scalar scope: ${scopeBy}.`);
  }

  return scope;
};
