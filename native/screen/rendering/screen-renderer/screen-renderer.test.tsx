import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScreenAnimation } from '../../declaration/screen-animation';
import type { ScreenPresentation } from '../../declaration/screen-presentation';
import { ScreenRuntime } from '../../runtime/screen-runtime';
import { ScreenRenderer } from './screen-renderer.tsx';

const animation = vi.hoisted(() => ({
  complete: [] as ((finished: boolean) => void)[],
}));

// Real renderer, screen machine and lifecycle; native animation completion is controlled.
vi.mock('react-native', () => ({
  View: ({
    children,
    style,
    pointerEvents,
    ...props
  }: React.PropsWithChildren<{
    style?: unknown;
    pointerEvents?: string;
    'aria-hidden'?: boolean;
  }>) => (
    <div
      data-scene={props['aria-hidden'] === undefined ? undefined : ''}
      data-style={JSON.stringify(style)}
      data-pointer={pointerEvents}
      aria-hidden={props['aria-hidden']}
    >
      {children}
    </div>
  ),
  StyleSheet: { create: (styles: object) => styles },
  TextInput: { State: { currentlyFocusedInput: () => null } },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock('react-native-reanimated', async () => {
  const { View } = await import('react-native');
  return {
    default: { View },
    cancelAnimation: () => undefined,
    runOnJS: (callback: unknown) => callback,
    useAnimatedStyle: (updater: () => object) => updater(),
    useSharedValue: (value: number) => React.useRef({ value }).current,
    withTiming: (_value: number, _config: object, complete: (finished: boolean) => void) => {
      animation.complete.push(complete);
      return 0;
    },
  };
});
vi.mock('react-native-worklets', () => ({ runOnUISync: (callback: () => void) => callback() }));

const presentation = (key: string, transition?: ScreenPresentation['transition']): ScreenPresentation => ({
  content: <span data-content={key}>{key}</span>,
  key,
  transition,
});

beforeEach(() => {
  animation.complete.length = 0;
});

describe('ScreenRenderer transition projection', () => {
  it('resolves the incoming presentation once per owner render, not once per retained scene', () => {
    const runtime = new ScreenRuntime();
    const retained = Array.from({ length: 79 }, (_, index) => presentation(String(index)));
    runtime.project(retained.at(-1)!, retained.slice(0, -1));
    const getSnapshot = runtime.getSnapshot;
    let original = getSnapshot();
    let reads = 0;
    const observe = (snapshot: ReturnType<typeof getSnapshot>) => ({
      ...snapshot,
      machine: {
        ...snapshot.machine,
        presentations: new Proxy(snapshot.machine.presentations, {
          get(target, key, receiver) {
            if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
            return Reflect.get(target, key, receiver);
          },
        }),
      },
    });
    let observed = observe(original);
    vi.spyOn(runtime, 'getSnapshot').mockImplementation(() => {
      const next = getSnapshot();
      if (next !== original) {
        original = next;
        observed = observe(next);
      }
      return observed;
    });
    render(<ScreenRenderer runtime={runtime} />);
    reads = 0;

    act(() =>
      runtime.project(
        presentation('incoming', {
          animation: ScreenAnimation.SlideFromRight,
          operation: 'present',
        }),
        retained,
      ),
    );

    expect(runtime.getSnapshot().scenes).toHaveLength(80);
    // One owner-render lookup plus the existing animation-start effect lookup.
    expect(reads).toBeLessThanOrEqual(80 * 2);
    expect(animation.complete).toHaveLength(1);
  });

  it('keeps slide direction, interaction and completion across a reversed transition', () => {
    const runtime = new ScreenRuntime();
    const home = presentation('home');
    runtime.project(home);
    const presented = vi.fn();
    const view = render(<ScreenRenderer onPresentationComplete={presented} runtime={runtime} />);
    presented.mockClear();

    const scene = (key: string) => view.container.querySelector(`[data-content="${key}"]`)!.closest('[data-scene]')!;
    const style = (key: string) => JSON.parse(scene(key).getAttribute('data-style')!)[1];
    act(() =>
      runtime.project(
        presentation('details', {
          animation: ScreenAnimation.SlideFromRight,
          operation: 'present',
        }),
        [home],
      ),
    );
    expect(style('details').transform).toEqual([{ translateX: 390 }, { translateY: 0 }]);
    expect(scene('details').getAttribute('data-pointer')).toBe('none');
    expect(presented).not.toHaveBeenCalled();
    const firstComplete = animation.complete[0];

    act(() => firstComplete(true));
    expect(runtime.getSnapshot().machine.phase).toBe('stable');
    expect(style('home').opacity).toBe(0);
    expect(scene('details').getAttribute('data-pointer')).toBe('auto');
    expect(presented).toHaveBeenCalledTimes(1);

    act(() =>
      runtime.project(
        presentation('home', {
          animation: ScreenAnimation.SlideFromLeft,
          operation: 'dismiss',
        }),
      ),
    );
    expect(style('home').transform).toEqual([{ translateX: -97.5 }, { translateY: 0 }]);
    act(() => firstComplete(true));
    expect(runtime.getSnapshot().machine.phase).toBe('transitioning');
    act(() => animation.complete[1](false));
    expect(runtime.getSnapshot().machine.phase).toBe('transitioning');
    act(() => animation.complete[1](true));
    expect(runtime.getSnapshot().machine.phase).toBe('stable');
    expect(runtime.getSnapshot().scenes.map((value) => value.key)).toEqual(['home']);
    expect(scene('home').getAttribute('data-pointer')).toBe('auto');
    expect(presented).toHaveBeenCalledTimes(2);
  });
});
