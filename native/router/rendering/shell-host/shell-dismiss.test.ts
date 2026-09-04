import { describe, expect, it } from 'vitest';

import { shouldCommitShellDismiss } from './shell-dismiss.ts';

describe('Native Shell dismiss resolution', () => {
  it('commits after crossing a quarter of the visible height', () => {
    expect(shouldCommitShellDismiss({ distance: 249, height: 1000, velocityY: 0 })).toBe(false);
    expect(shouldCommitShellDismiss({ distance: 250, height: 1000, velocityY: 0 })).toBe(true);
  });

  it('commits a fast downward gesture before the distance threshold', () => {
    expect(shouldCommitShellDismiss({ distance: 80, height: 1000, velocityY: 899 })).toBe(false);
    expect(shouldCommitShellDismiss({ distance: 80, height: 1000, velocityY: 900 })).toBe(true);
  });

  it('does not treat an upward release as a dismiss velocity', () => {
    expect(shouldCommitShellDismiss({ distance: 80, height: 1000, velocityY: -1200 })).toBe(false);
  });
});
