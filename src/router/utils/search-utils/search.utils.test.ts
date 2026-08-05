import { describe, expect, it } from 'vitest';

import { parseSearchParams, updateSearchParams } from './search.utils.ts';

describe('search utils', () => {
  describe('parseSearchParams', () => {
    it('parses values as strings by default', () => {
      expect(parseSearchParams('?enabled=true&page=2&empty=&search=terminal')).toEqual({
        empty: '',
        enabled: 'true',
        page: '2',
        search: 'terminal',
      });
    });

    it('converts primitive values when type conversion is enabled', () => {
      expect(
        parseSearchParams('?enabled=true&page=2&nullable=null&missing=undefined', {
          enableTypeConversion: true,
        }),
      ).toEqual({
        enabled: true,
        missing: undefined,
        nullable: null,
        page: 2,
      });
    });

    it('parses repeated indexed and bracket arrays', () => {
      expect(
        parseSearchParams('?tag=one&tag=two&ids[]=1&ids[]=2&ordered[1]=next&ordered[0]=first', {
          enableTypeConversion: true,
        }),
      ).toEqual({
        ids: [1, 2],
        ordered: ['first', 'next'],
        tag: ['one', 'two'],
      });
    });

    it('parses separated arrays when arraySeparator is provided', () => {
      expect(
        parseSearchParams('?ids=1,2,3', {
          arraySeparator: ',',
          enableTypeConversion: true,
        }),
      ).toEqual({
        ids: [1, 2, 3],
      });
    });

    it('parses nested object keys and JSON object values', () => {
      expect(
        parseSearchParams('?filter.status=active&filter.page=2&payload=%7B%22id%22%3A42%7D', {
          enableTypeConversion: true,
        }),
      ).toEqual({
        filter: {
          page: 2,
          status: 'active',
        },
        payload: {
          id: 42,
        },
      });
    });
  });

  describe('updateSearchParams', () => {
    it('merges and clears undefined values by default', () => {
      expect(
        updateSearchParams('?page=1&search=terminal&mode=list', {
          mode: undefined,
          page: 2,
        }),
      ).toBe('page=2&search=terminal');
    });

    it('keeps existing values when clearUndefined is disabled', () => {
      expect(
        updateSearchParams(
          '?page=1&search=terminal',
          {
            search: undefined,
          },
          {
            clearUndefined: false,
          },
        ),
      ).toBe('page=1&search=terminal');
    });

    it('serializes arrays and object values', () => {
      const search = updateSearchParams('', {
        filter: {
          status: 'active',
        },
        tag: ['one', 'two'],
      });

      expect(parseSearchParams(search)).toEqual({
        filter: {
          status: 'active',
        },
        tag: ['one', 'two'],
      });
    });
  });
});
