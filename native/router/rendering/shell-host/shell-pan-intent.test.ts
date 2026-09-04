import { describe, expect, it } from 'vitest';

import { isTouchWithinShellScrollBounds, resolveShellPanIntent } from './shell-pan-intent.ts';

const resolve = (deltaX: number, deltaY: number, scrollOffset = 0) =>
  resolveShellPanIntent({
    deltaX,
    deltaY,
    horizontalTolerance: 24,
    scrollOffset,
    verticalActivationDistance: 8,
  });

describe('resolveShellPanIntent', () => {
  it('waits until a downward gesture crosses the activation distance', () => {
    expect(resolve(0, 7)).toBe('wait');
  });

  it('activates dismiss when content is already at the top', () => {
    expect(resolve(0, 8)).toBe('activate');
  });

  it('keeps waiting while scrollable content is above its top boundary', () => {
    expect(resolve(0, 40, 12)).toBe('wait');
    expect(resolve(0, 40, 0)).toBe('activate');
  });

  it('fails dismiss for upward and horizontal gestures', () => {
    expect(resolve(0, -8)).toBe('fail');
    expect(resolve(25, 12)).toBe('fail');
  });
});

describe('isTouchWithinShellScrollBounds', () => {
  it('distinguishes scroll content from the rest of the shell layer', () => {
    const bounds = { bottom: 900, top: 300 };

    expect(isTouchWithinShellScrollBounds(299, bounds)).toBe(false);
    expect(isTouchWithinShellScrollBounds(300, bounds)).toBe(true);
    expect(isTouchWithinShellScrollBounds(900, bounds)).toBe(true);
    expect(isTouchWithinShellScrollBounds(901, bounds)).toBe(false);
    expect(isTouchWithinShellScrollBounds(500, null)).toBe(false);
  });
});
