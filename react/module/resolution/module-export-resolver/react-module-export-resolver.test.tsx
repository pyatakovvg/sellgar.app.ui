import React from 'react';
import { describe, expect, it } from 'vitest';

import { Module } from '../../declaration/module';
import { ReactModuleExportResolver } from './react-module-export-resolver.ts';

const View: React.FC = () => null;

@Module({ view: View })
class FirstModule {}

@Module({ view: View })
class SecondModule {}

describe('ReactModuleExportResolver', () => {
  it('accepts exactly one React Module declaration', () => {
    const resolver = new ReactModuleExportResolver();

    expect(resolver.resolve({ FirstModule }).token).toBe(FirstModule);
  });

  it('rejects a lazy package without a React Module declaration', () => {
    const resolver = new ReactModuleExportResolver();

    expect(() => resolver.resolve({ value: class IncompatibleModule {} })).toThrow('Экспорт React Module не найден');
  });

  it('rejects an ambiguous lazy package before creating a Module runtime', () => {
    const resolver = new ReactModuleExportResolver();

    expect(() => resolver.resolve({ FirstModule, SecondModule })).toThrow(
      'Пакет должен экспортировать ровно один класс React @Module',
    );
  });
});
