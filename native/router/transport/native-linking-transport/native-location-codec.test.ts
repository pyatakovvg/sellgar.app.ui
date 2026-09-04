import { describe, expect, it } from 'vitest';

import { decodeNativeLocation } from './native-location-codec.ts';

describe('decodeNativeLocation', () => {
  it('decodes a custom-scheme route with independent root and nested query scopes', () => {
    expect(decodeNativeLocation('sellgar-app-v2://products/42?search=dress#modify?tab=stock&tab=prices')).toEqual({
      address: ['products', '42'],
      nested: { address: ['modify'], query: { tab: ['stock', 'prices'] } },
      query: { search: 'dress' },
      revalidate: true,
      state: undefined,
    });
  });

  it('strips an application prefix from a universal link', () => {
    expect(
      decodeNativeLocation('https://admin.sellgar.app/mobile/products/42', {
        prefixes: ['https://admin.sellgar.app/mobile'],
      }).address,
    ).toEqual(['products', '42']);
  });
});
