import 'reflect-metadata';

import { describe, expect, it } from 'vitest';
import { Expose, Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

import { ClassTransformerRouterParamsConverter } from './';

describe('ClassTransformerRouterParamsConverter', () => {
  it('converts plain params to exposed dto shape', () => {
    const converter = new ClassTransformerRouterParamsConverter();

    expect(
      converter.toObject(
        SearchParamsDto,
        {
          page: '2',
          search: 'terminal',
          unknown: 'ignored',
        },
        {
          enableTypeConversion: true,
        },
      ),
    ).toEqual({
      page: 2,
      search: 'terminal',
    });
  });

  it('keeps optional values absent in the plain object', () => {
    const converter = new ClassTransformerRouterParamsConverter();

    expect(
      converter.toObject(
        SearchParamsDto,
        {
          page: '2',
        },
        {
          enableTypeConversion: true,
        },
      ),
    ).toEqual({
      page: 2,
    });
  });

  it('throws class-validator errors for invalid params', () => {
    const converter = new ClassTransformerRouterParamsConverter();

    expect(() =>
      converter.toObject(
        SearchParamsDto,
        {
          page: 'invalid',
        },
        {
          enableTypeConversion: true,
        },
      ),
    ).toThrow();
  });
});

class SearchParamsDto {
  @Expose()
  @Type(() => Number)
  @IsNumber()
  page!: number;

  @Expose()
  @IsOptional()
  @IsString()
  search?: string;
}
