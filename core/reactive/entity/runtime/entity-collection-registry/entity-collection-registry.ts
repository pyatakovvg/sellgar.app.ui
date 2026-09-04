import type { EntityConstructor } from '../../declaration/entity';

export interface EntityCollectionScope {
  readonly entity: string;
  readonly owner: string;
}

export interface EntityCollectionRegistration<TEntity extends object = object> {
  readonly collection: Record<string, unknown>;
  readonly property: string;
  readonly entity: EntityConstructor<TEntity>;
  readonly scopeBy?: EntityCollectionScope;
}

interface EntityCollectionReference {
  readonly entity: EntityConstructor;
  readonly property: string;
  readonly reference: WeakRef<Record<string, unknown>>;
  readonly scopeBy?: EntityCollectionScope;
}

class EntityCollectionRegistry {
  private readonly collections = new Map<EntityConstructor, Set<EntityCollectionReference>>();
  private readonly finalizationRegistry = new FinalizationRegistry<EntityCollectionReference>((registration) => {
    this.remove(registration);
  });

  find<TEntity extends object>(entity: EntityConstructor<TEntity>): Array<EntityCollectionRegistration<TEntity>> {
    const references = this.collections.get(entity);

    if (!references) {
      return [];
    }

    const registrations: Array<EntityCollectionRegistration<TEntity>> = [];

    for (const registration of references) {
      const collection = registration.reference.deref();

      if (!collection) {
        this.remove(registration);
        continue;
      }

      registrations.push({
        collection,
        entity,
        property: registration.property,
        scopeBy: registration.scopeBy,
      });
    }

    return registrations;
  }

  register<TEntity extends object>(
    entity: EntityConstructor<TEntity>,
    property: string,
    collection: Record<string, unknown>,
    scopeBy?: EntityCollectionScope,
  ): void {
    const references = this.collections.get(entity) ?? new Set<EntityCollectionReference>();
    const reference = new WeakRef(collection);
    const registration = { entity, property, reference, scopeBy };

    references.add(registration);
    this.collections.set(entity, references);
    this.finalizationRegistry.register(collection, registration, registration);
  }

  private remove(registration: EntityCollectionReference): void {
    const references = this.collections.get(registration.entity);

    if (!references) {
      return;
    }

    references.delete(registration);
    this.finalizationRegistry.unregister(registration);

    if (references.size === 0) {
      this.collections.delete(registration.entity);
    }
  }
}

export const entityCollectionRegistry = new EntityCollectionRegistry();
