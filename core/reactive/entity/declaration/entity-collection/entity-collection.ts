import type { EntityConstructor } from '../entity';
import { initializeObservableEntityCollection } from '../../runtime/entity-collection-observer';
import type { EntityCollectionScope } from '../../runtime/entity-collection-registry';

type EntityCollectionScopeValue = string | number;

type EntityCollectionScopeProperty<TEntity extends object> = {
  [TProperty in Extract<keyof TEntity, string>]-?: TEntity[TProperty] extends EntityCollectionScopeValue
    ? TProperty
    : never;
}[Extract<keyof TEntity, string>];

interface EntityCollectionScopeMapping<
  TEntity extends object,
  TEntityProperty extends EntityCollectionScopeProperty<TEntity> = EntityCollectionScopeProperty<TEntity>,
> {
  readonly entity: TEntityProperty;
  readonly owner: string;
}

type EntityCollectionScopeBy<TEntity extends object> =
  EntityCollectionScopeMapping<TEntity> | EntityCollectionScopeProperty<TEntity>;

export interface EntityCollectionOptions<
  TEntity extends object,
  TProperty extends string,
  TScopeBy extends EntityCollectionScopeBy<TEntity> | undefined = EntityCollectionScopeBy<TEntity> | undefined,
> {
  readonly entity: EntityConstructor<TEntity>;
  readonly property: TProperty;
  readonly scopeBy?: TScopeBy;
}

type EntityCollectionOwnerScopeProperty<TScopeBy> = TScopeBy extends string
  ? TScopeBy
  : TScopeBy extends { readonly owner: infer TProperty extends string }
    ? TProperty
    : never;

type EntityCollectionInstance<TEntity extends object, TProperty extends string, TScopeBy> = Record<
  TProperty,
  TEntity[]
> &
  (TScopeBy extends undefined
    ? object
    : Record<EntityCollectionOwnerScopeProperty<TScopeBy>, EntityCollectionScopeValue>);

export type EntityCollectionDecorator<TEntity extends object, TProperty extends string, TScopeBy = undefined> = <
  TConstructor extends abstract new (...args: never[]) => EntityCollectionInstance<TEntity, TProperty, TScopeBy>,
>(
  constructor: TConstructor,
) => TConstructor | void;

export const EntityCollection = <
  TEntity extends object,
  TProperty extends string,
  const TScopeBy extends EntityCollectionScopeBy<TEntity> | undefined = undefined,
>(
  options: EntityCollectionOptions<TEntity, TProperty, TScopeBy>,
): EntityCollectionDecorator<TEntity, TProperty, TScopeBy> => {
  return ((constructor: Function) => {
    const CollectionTarget = constructor as unknown as new (...args: never[]) => object;

    class ObservableEntityCollection extends CollectionTarget {
      constructor(...args: never[]) {
        super(...args);
        const declaredScope = options.scopeBy as EntityCollectionScope | string | undefined;
        const scopeBy =
          typeof declaredScope === 'string'
            ? Object.freeze({
                entity: declaredScope,
                owner: declaredScope,
              })
            : declaredScope;

        initializeObservableEntityCollection(this, options.entity, options.property, scopeBy);
      }
    }

    Object.defineProperty(ObservableEntityCollection, 'name', {
      configurable: true,
      value: CollectionTarget.name,
    });

    return ObservableEntityCollection;
  }) as EntityCollectionDecorator<TEntity, TProperty, TScopeBy>;
};
