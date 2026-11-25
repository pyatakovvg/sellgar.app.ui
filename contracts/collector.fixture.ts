import {
  Collector,
  CollectorInterface,
  CollectorServiceInterface,
  Controller,
  Inject,
  InjectCollector,
  type BindingRegistryInterface,
} from '../core';

const collector: CollectorInterface<{ id: string }, { offset: number; complete: boolean }> = new Collector();
// @ts-expect-error Runtime ownership context is not a public constructor argument.
new Collector(undefined, undefined);

export const bindCollector = (registry: BindingRegistryInterface): void => {
  registry.bind(CollectorInterface).to(Collector);
};

collector.execute(async (collection, state) => {
  const offset: number | undefined = state.get('offset');
  state.set('offset', (offset ?? 0) + 10);
  state.set('complete', false);
  // @ts-expect-error State values must match their declared keys.
  state.set('offset', '10');
  // @ts-expect-error Only consumer-declared keys are available.
  state.get('nextCursor');
  // @ts-expect-error Append does not accept pagination metadata.
  collection.append([{ id: 'one' }], 'next');
  return collection.append([{ id: 'one' }]);
});

// @ts-expect-error Collect always returns an array, not the response contract.
collector.execute(async (collection) => ({ items: collection.append([{ id: 'one' }]) }));
// @ts-expect-error State is read-only outside the collection request.
collector.state.set('offset', 1);

@Controller()
export class OwnedCollectorFixture {
  constructor(
    @InjectCollector('rows')
    readonly rows: CollectorInterface<{ id: string }, { position: string | null }>,
    @InjectCollector('options')
    readonly options: CollectorInterface<{ id: number }>,
    @Inject(CollectorServiceInterface)
    readonly collections: CollectorServiceInterface,
  ) {}
}

declare const owned: OwnedCollectorFixture;
owned.rows.reset();
owned.collections.reset('rows');
// @ts-expect-error Addressed reset belongs to the collection service.
owned.rows.reset('options');
// @ts-expect-error Collector ownership and key registration are automatic.
owned.rows.register('rows');
// @ts-expect-error Addressed reset requires a key.
owned.collections.reset();
// @ts-expect-error A key is a string, not a dependency token.
owned.collections.reset(OwnedCollectorFixture);
// @ts-expect-error Null is not an unnamed collector.
InjectCollector(null);
// @ts-expect-error The specialized injector requires an explicit key.
InjectCollector();
// @ts-expect-error A collection key is not a numeric item ID.
InjectCollector(42);

export class InvalidPropertyCollectorFixture {
  // @ts-expect-error The specialized injector is supported only on constructor parameters.
  @InjectCollector('property')
  readonly collector!: CollectorInterface<number>;
}
