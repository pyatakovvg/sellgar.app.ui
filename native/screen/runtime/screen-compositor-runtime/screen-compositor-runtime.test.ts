import { describe, expect, it, vi } from 'vitest';

import { ScreenCompositorRuntime } from './screen-compositor-runtime.ts';

describe('ScreenCompositorRuntime touch ownership', () => {
  it('keeps inactive ancestors reachable without activating them or sibling layers', () => {
    const runtime = new ScreenCompositorRuntime();
    const application = Symbol('application');
    const outer = Symbol('outer');
    const inner = Symbol('inner');
    const sibling = Symbol('sibling');
    runtime.register(application, 'application', 0);
    runtime.register(outer, 'frame', 0);
    runtime.register(sibling, 'frame', 1);
    runtime.register(inner, 'frame', 2, outer);

    expect(runtime.getLayerSnapshot(application)).toEqual({ active: false, canReceiveTouches: false });
    expect(runtime.getLayerSnapshot(sibling)).toEqual({ active: false, canReceiveTouches: false });
    expect(runtime.getLayerSnapshot(outer)).toEqual({ active: false, canReceiveTouches: true });
    expect(runtime.getLayerSnapshot(inner)).toEqual({ active: true, canReceiveTouches: true });
  });

  it('publishes a newly registered ancestor even when the active identity does not change', () => {
    const runtime = new ScreenCompositorRuntime();
    const root = Symbol('root');
    const middle = Symbol('middle');
    const leaf = Symbol('leaf');
    runtime.register(leaf, 'frame', 2, middle);
    const before = runtime.getLayerSnapshot(root);
    const listener = vi.fn(() => runtime.getLayerSnapshot(root));
    runtime.subscribe(listener);

    runtime.register(middle, 'frame', 1, root);

    expect(runtime.isActive(leaf)).toBe(true);
    expect(before.canReceiveTouches).toBe(false);
    expect(listener).toHaveReturnedWith({ active: false, canReceiveTouches: true });
    expect(runtime.getLayerSnapshot(root)).not.toBe(before);
    runtime.register(root, 'frame', 0);
    expect(runtime.getLayerSnapshot(root)).toEqual({ active: false, canReceiveTouches: true });
  });

  it('restores the deepest frame after a modal closes and each parent after its child closes', () => {
    const runtime = new ScreenCompositorRuntime();
    const root = Symbol('root');
    const inner = Symbol('inner');
    const modal = Symbol('modal');
    const removeRoot = runtime.register(root, 'frame', 0);
    const removeInner = runtime.register(inner, 'frame', 100, root);
    const removeModal = runtime.register(modal, 'modal', 0);

    expect(runtime.getLayerSnapshot(root).canReceiveTouches).toBe(false);
    expect(runtime.getLayerSnapshot(inner).canReceiveTouches).toBe(false);
    expect(runtime.isActive(modal)).toBe(true);
    removeModal();
    expect(runtime.isActive(inner)).toBe(true);
    expect(runtime.getLayerSnapshot(root)).toEqual({ active: false, canReceiveTouches: true });
    removeInner();
    expect(runtime.isActive(root)).toBe(true);
    removeRoot();
    expect(runtime.getLayerSnapshot(root)).toEqual({ active: true, canReceiveTouches: true });
  });

  it('preserves last-mounted precedence at equal depth and restores the previous sibling', () => {
    const runtime = new ScreenCompositorRuntime();
    const first = Symbol('first');
    const second = Symbol('second');
    runtime.register(first, 'frame', 1);
    const remove = runtime.register(second, 'frame', 1);
    expect(runtime.isActive(first)).toBe(false);
    expect(runtime.isActive(second)).toBe(true);
    remove();
    expect(runtime.isActive(first)).toBe(true);
  });

  it('keeps snapshots stable and skips notifications when the effective touch path is unchanged', () => {
    const runtime = new ScreenCompositorRuntime();
    const active = Symbol('active');
    const background = Symbol('background');
    runtime.register(active, 'frame', 1);
    const snapshot = runtime.getLayerSnapshot(active);
    const listener = vi.fn();
    const unsubscribe = runtime.subscribe(listener);

    const remove = runtime.register(background, 'application', 0);
    expect(runtime.getLayerSnapshot(active)).toBe(snapshot);
    remove();
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
    runtime.register(Symbol('modal'), 'modal', 0);
    expect(listener).not.toHaveBeenCalled();
  });
});
