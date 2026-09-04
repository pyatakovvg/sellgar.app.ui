import { describe, expect, it } from 'vitest';

import { resolveRootBack } from './native-root-back';

describe('resolveRootBack', () => {
  it('arms exit on the first root back press', () => {
    expect(resolveRootBack(null, 1_000)).toEqual({ exit: false, pressedAt: 1_000 });
  });

  it('exits on the second root back press inside the confirmation window', () => {
    expect(resolveRootBack(1_000, 2_500)).toEqual({ exit: true, pressedAt: null });
  });

  it('starts a new confirmation window after the previous one expires', () => {
    expect(resolveRootBack(1_000, 3_001)).toEqual({ exit: false, pressedAt: 3_001 });
  });
});
