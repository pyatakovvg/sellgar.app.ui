import { initializeObservableEntity } from '../runtime/initialize-observable-entity';

export const ENTITY_METADATA_KEY = Symbol('tiyn-app:reactive:entity:metadata');

export type EntityIdentity = string | number;

export type EntityConstructor<TEntity extends object = object> = abstract new (...args: never[]) => TEntity;

export interface EntityMetadata<TIdentityProperty extends PropertyKey = PropertyKey> {
  readonly identity: TIdentityProperty;
}

export interface EntityOptions<TIdentityProperty extends PropertyKey> {
  readonly identity: TIdentityProperty;
}

export type EntityDecorator<TIdentityProperty extends PropertyKey> = <
  TConstructor extends abstract new (...args: never[]) => Record<TIdentityProperty, EntityIdentity>,
>(
  constructor: TConstructor,
) => TConstructor | void;

export const isEntityConstructor = (value: unknown): value is EntityConstructor => {
  if (typeof value !== 'function') {
    return false;
  }

  return Reflect.hasMetadata(ENTITY_METADATA_KEY, value);
};

export const resolveEntityConstructor = <TEntity extends object>(
  constructor: EntityConstructor<TEntity>,
): EntityConstructor<TEntity> => {
  let current: unknown = constructor;

  while (typeof current === 'function') {
    if (Reflect.hasOwnMetadata(ENTITY_METADATA_KEY, current)) {
      return current as EntityConstructor<TEntity>;
    }

    current = Object.getPrototypeOf(current) as unknown;
  }

  throw new Error('Класс не помечен @Entity().');
};

export const getEntityMetadata = (entity: EntityConstructor): EntityMetadata => {
  const metadata = Reflect.getMetadata(ENTITY_METADATA_KEY, entity) as EntityMetadata | undefined;

  if (metadata === undefined) {
    throw new Error('Метаданные реактивной сущности не определены.');
  }

  return metadata;
};

export const getEntityIdentity = <TEntity extends object>(entity: TEntity): EntityIdentity => {
  const entityConstructor = entity.constructor as EntityConstructor<TEntity>;
  const identityProperty = getEntityMetadata(entityConstructor).identity;
  const identity = Reflect.get(entity, identityProperty) as unknown;

  if (typeof identity !== 'string' && typeof identity !== 'number') {
    throw new Error(`Identity реактивной сущности должен быть строкой или числом: ${String(identityProperty)}.`);
  }

  return identity;
};

export function Entity(): EntityDecorator<'id'>;
export function Entity<TIdentityProperty extends PropertyKey>(
  options: EntityOptions<TIdentityProperty>,
): EntityDecorator<TIdentityProperty>;
export function Entity<TIdentityProperty extends PropertyKey>(
  options?: EntityOptions<TIdentityProperty>,
): EntityDecorator<TIdentityProperty | 'id'> {
  const metadata: EntityMetadata<TIdentityProperty | 'id'> = {
    identity: options?.identity ?? 'id',
  };

  return ((constructor: Function) => {
    const EntityTarget = constructor as unknown as new (...args: never[]) => object;

    class ObservableEntity extends EntityTarget {
      constructor(...args: never[]) {
        super(...args);
        initializeObservableEntity(this, ObservableEntity, metadata.identity);
      }
    }

    Object.defineProperty(ObservableEntity, 'name', {
      configurable: true,
      value: EntityTarget.name,
    });

    Reflect.defineMetadata(ENTITY_METADATA_KEY, metadata, ObservableEntity);

    return ObservableEntity;
  }) as EntityDecorator<TIdentityProperty | 'id'>;
}
