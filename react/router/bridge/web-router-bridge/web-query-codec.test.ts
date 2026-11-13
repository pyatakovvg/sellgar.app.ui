import { describe, expect, it } from 'vitest';

import { parseWebQuery, serializeWebQuery } from './web-query-codec.ts';

describe('Web query array bounds', () => {
  it('keeps indexed arrays within their maximum length', () => {
    const query = parseWebQuery('item[999]=last&item[0]=first', {});

    expect(query.item).toHaveLength(1000);
    expect(query.item).toEqual(expect.arrayContaining(['first', 'last']));
  });

  it.each(['1000', '50000', '9007199254740992', '9'.repeat(400)])(
    'rejects an oversized index %s before allocating',
    (index) => {
      expect(() => parseWebQuery(`item[${index}]=value`, {})).toThrow(RangeError);
    },
  );

  it('applies the same bound inside nested query objects', () => {
    expect(() => parseWebQuery('filter.items[1000]=value', {})).toThrow(RangeError);
  });

  it('preserves literal keys when array parsing is disabled', () => {
    expect(parseWebQuery('item[50000]=value', { parseArrays: false })).toEqual({ 'item[50000]': 'value' });
  });

  it('preserves repeated values, empty slots and round trips of ordinary arrays', () => {
    const query = parseWebQuery('item[2]=third&item[0]=first&status=success&status=failed', {});

    expect(query).toEqual({ item: ['first', undefined, 'third'], status: ['success', 'failed'] });
    expect(parseWebQuery(serializeWebQuery({ status: ['success', 'failed'] }), {})).toEqual({
      status: ['success', 'failed'],
    });
  });
});
