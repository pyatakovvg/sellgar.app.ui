import { describe, expect, it } from 'vitest';
import { RefreshGesture, isRefreshStart } from './refresh-gesture.ts';

describe('refresh gesture admission', () => {
  it('requires a gesture before accepting a refresh request', () => {
    expect(new RefreshGesture().accept(false)).toBe(false);
  });
  it('does not turn a scroll into refresh when it reaches the top', () => {
    const gesture = new RefreshGesture();
    gesture.begin(false, false);
    expect(gesture.accept(false)).toBe(false);
    gesture.begin(true, false);
    expect(gesture.accept(false)).toBe(true);
  });

  it('accepts once and does not start another request while refreshing', () => {
    const gesture = new RefreshGesture();
    gesture.begin(true, false);
    expect(gesture.accept(false)).toBe(true);
    gesture.begin(true, false);
    expect(gesture.accept(false)).toBe(false);
    gesture.complete();
    gesture.begin(true, false);
    expect(gesture.accept(false)).toBe(true);
  });

  it('does not admit a keyboard-dismiss gesture even after the keyboard is hidden', () => {
    const gesture = new RefreshGesture();
    gesture.begin(true, true);
    expect(gesture.accept(false)).toBe(false);
  });

  it('accounts for the top content inset', () => {
    expect(isRefreshStart(-44, 44)).toBe(true);
    expect(isRefreshStart(0, 44)).toBe(false);
  });
});
