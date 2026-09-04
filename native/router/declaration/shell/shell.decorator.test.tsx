import React from 'react';
import { describe, expect, it } from 'vitest';

import { getShellMetadata, isShellConstructor, Shell, ShellInterface, type ShellContextInterface } from './index.ts';

const ShellView: React.FC<ShellContextInterface> = (props) => <>{props.children}</>;

@Shell({ view: ShellView })
class TestShell extends ShellInterface {}

class UndeclaredShell extends ShellInterface {}

describe('Native Shell declaration', () => {
  it('stores an immutable view declaration on the Shell constructor', () => {
    const metadata = getShellMetadata(TestShell);

    expect(isShellConstructor(TestShell)).toBe(true);
    expect(metadata.view).toBe(ShellView);
    expect(Object.isFrozen(metadata)).toBe(true);
  });

  it('rejects a class without @Shell metadata', () => {
    expect(isShellConstructor(UndeclaredShell)).toBe(false);
    expect(() => getShellMetadata(UndeclaredShell)).toThrow('Метаданные Native Shell не определены.');
  });
});
