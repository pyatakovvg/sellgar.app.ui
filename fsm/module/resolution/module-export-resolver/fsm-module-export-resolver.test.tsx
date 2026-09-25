import React from 'react';
import { describe, expect, it } from 'vitest';

import { Module } from '../../declaration/module';
import { FsmModuleExportResolver } from './fsm-module-export-resolver.ts';

const View: React.FC = () => null;

@Module({ view: View })
class FirstModule {}

@Module({ view: View })
class SecondModule {}

describe('FsmModuleExportResolver', () => {
  it('accepts exactly one FSM Module declaration', () => {
    const resolver = new FsmModuleExportResolver();

    expect(resolver.resolve({ FirstModule }).token).toBe(FirstModule);
  });

  it('rejects a lazy package without an FSM Module declaration', () => {
    const resolver = new FsmModuleExportResolver();

    expect(() => resolver.resolve({ value: class IncompatibleModule {} })).toThrow('Экспорт FSM Module не найден');
  });

  it('rejects an ambiguous lazy package before creating a Module runtime', () => {
    const resolver = new FsmModuleExportResolver();

    expect(() => resolver.resolve({ FirstModule, SecondModule })).toThrow(
      'Пакет должен экспортировать ровно один класс FSM @Module',
    );
  });
});
