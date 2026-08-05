import type { EntityConstructor, EntityIdentity } from '../declaration';

interface EntityReference {
  readonly constructor: EntityConstructor;
  readonly identity: EntityIdentity;
  readonly reference: WeakRef<object>;
}

class EntityRegistry {
  private readonly entities = new Map<EntityConstructor, Map<EntityIdentity, Set<WeakRef<object>>>>();
  private readonly finalizationRegistry = new FinalizationRegistry<EntityReference>((registration) => {
    this.remove(registration);
  });

  find<TEntity extends object>(constructor: EntityConstructor<TEntity>, identity: EntityIdentity): TEntity[] {
    const entitiesByIdentity = this.entities.get(constructor);
    const references = entitiesByIdentity?.get(identity);

    if (entitiesByIdentity === undefined || references === undefined) {
      return [];
    }

    const entities: TEntity[] = [];

    for (const reference of references) {
      const entity = reference.deref();

      if (entity === undefined) {
        this.remove({
          constructor,
          identity,
          reference,
        });
        continue;
      }

      entities.push(entity as TEntity);
    }

    return entities;
  }

  register<TEntity extends object>(
    constructor: EntityConstructor<TEntity>,
    identity: EntityIdentity,
    entity: TEntity,
  ): void {
    const entitiesByIdentity = this.entities.get(constructor) ?? new Map<EntityIdentity, Set<WeakRef<object>>>();
    const references = entitiesByIdentity.get(identity) ?? new Set<WeakRef<object>>();
    const reference = new WeakRef<object>(entity);
    const registration: EntityReference = {
      constructor,
      identity,
      reference,
    };

    references.add(reference);
    entitiesByIdentity.set(identity, references);
    this.entities.set(constructor, entitiesByIdentity);
    this.finalizationRegistry.register(entity, registration, reference);
  }

  private remove(registration: EntityReference): void {
    const entitiesByIdentity = this.entities.get(registration.constructor);
    const references = entitiesByIdentity?.get(registration.identity);

    if (entitiesByIdentity === undefined || references === undefined) {
      return;
    }

    references.delete(registration.reference);
    this.finalizationRegistry.unregister(registration.reference);

    if (references.size === 0) {
      entitiesByIdentity.delete(registration.identity);
    }

    if (entitiesByIdentity.size === 0) {
      this.entities.delete(registration.constructor);
    }
  }
}

export const entityRegistry = new EntityRegistry();
