import { Collector } from '../core';

const collector = new Collector<{ id: string }, { offset: number; complete: boolean }>();

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
