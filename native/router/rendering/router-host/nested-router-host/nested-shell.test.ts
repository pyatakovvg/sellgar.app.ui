import { describe, expect, it } from 'vitest';

import type { ShellConstructor } from '../../../declaration/shell';
import { resolveNestedShell } from './nested-shell.ts';

abstract class LocalShell {}
abstract class DefaultShell {}

describe('resolveNestedShell', () => {
  it('prefers the nested Router shell over the application default', () => {
    expect(resolveNestedShell(LocalShell as ShellConstructor, DefaultShell as ShellConstructor)).toBe(LocalShell);
  });

  it('uses app.routing shell when the nested Router has no local override', () => {
    expect(resolveNestedShell(undefined, DefaultShell as ShellConstructor)).toBe(DefaultShell);
  });

  it('rejects a nested Router without any shell presentation', () => {
    expect(() => resolveNestedShell(undefined, undefined)).toThrow(
      'Вложенный Router требует локальный shell или app.routing({ shell }).',
    );
  });
});
