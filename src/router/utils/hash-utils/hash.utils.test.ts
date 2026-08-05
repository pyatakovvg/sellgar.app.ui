import { describe, expect, it } from 'vitest';

import { createHashFromObject, parseHashToObject } from './hash.utils.ts';

describe('hash utils', () => {
  describe('createHashFromObject', () => {
    it('serializes top-level values with explicit string markers', () => {
      expect(
        createHashFromObject({
          empty: '',
          falseValue: false,
          nullValue: null,
          numberValue: 123,
          stringNumber: '123',
          text: 'value',
          trueValue: true,
          undefinedValue: void 0,
        }),
      ).toBe(
        [
          "empty=''",
          'falseValue=false',
          'nullValue',
          'numberValue=123',
          "stringNumber='123'",
          "text='value'",
          'trueValue=true',
        ].join('&'),
      );
    });

    it('serializes nested values by the same rules', () => {
      expect(
        createHashFromObject({
          terminal: {
            empty: '',
            id: '123',
            nullable: null,
            numberId: 123,
            skip: void 0,
          },
        }),
      ).toBe("terminal(empty=''&id='123'&nullable&numberId=123)");
    });
  });

  describe('parseHashToObject', () => {
    it('parses unconverted values as strings and keeps quoted values as strings', () => {
      expect(
        parseHashToObject(
          "#empty=''&falseValue=false&nullValue&nullString=null&numberValue=123&stringNumber='123'&text=value&trueValue=true",
        ),
      ).toEqual({
        empty: '',
        falseValue: 'false',
        nullString: 'null',
        nullValue: 'null',
        numberValue: '123',
        stringNumber: '123',
        text: 'value',
        trueValue: 'true',
      });
    });

    it('converts unquoted values when type conversion is enabled', () => {
      expect(
        parseHashToObject(
          "#empty=''&falseValue=false&nullValue&nullString=null&numberValue=123&stringNumber='123'&text=value&trueValue=true",
          { enableTypeConversion: true },
        ),
      ).toEqual({
        empty: '',
        falseValue: false,
        nullString: null,
        nullValue: null,
        numberValue: 123,
        stringNumber: '123',
        text: 'value',
        trueValue: true,
      });
    });

    it('applies the same parsing rules to nested values', () => {
      expect(
        parseHashToObject("terminal(empty=''&id='123'&nullable&numberId=123)", {
          enableTypeConversion: true,
        }),
      ).toEqual({
        terminal: {
          empty: '',
          id: '123',
          nullable: null,
          numberId: 123,
        },
      });
    });

    it('parses nested values for component names with hyphens', () => {
      expect(parseHashToObject("#user-view(id='1')")).toEqual({
        'user-view': {
          id: '1',
        },
      });
    });

    it('keeps hash semantics stable after converted parse and serialization', () => {
      const parsedHash = parseHashToObject("#flag&enabled=true&terminal(id='123'&nullable)", {
        enableTypeConversion: true,
      });

      expect(createHashFromObject(parsedHash)).toBe("terminal(id='123'&nullable)&flag&enabled=true");
    });
  });
});
