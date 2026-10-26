import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScreenCompositor, ScreenLayerHost } from '../../../screen/rendering/screen-compositor';
import { useScreenActive } from '../../../screen/runtime/screen-activity-context';
import { ShellHost } from './shell-host.tsx';
import type { ShellContextInterface } from '../../declaration/shell';

// Preserve the native hit-testing configuration; the DOM itself does not implement pointerEvents.
vi.mock('react-native', () => ({
  View: ({ children, pointerEvents }: React.PropsWithChildren<{ pointerEvents?: string }>) => (
    <div data-pointer={pointerEvents}>{children}</div>
  ),
  StyleSheet: { create: (styles: object) => styles, absoluteFill: {} },
  Keyboard: { dismiss: vi.fn() },
  TextInput: { State: { currentlyFocusedInput: () => null } },
}));
vi.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children, gesture }: React.PropsWithChildren<{ gesture: { enabled: boolean } }>) => (
    <div data-pan-enabled={String(gesture.enabled)}>{children}</div>
  ),
  usePanGesture: (config: object) => config,
  GestureStateManager: { activate: vi.fn(), fail: vi.fn() },
}));
vi.mock('react-native-keyboard-controller', async () => {
  const { View } = await import('react-native');
  return { KeyboardAvoidingView: View, useReanimatedKeyboardAnimation: () => ({ height: { value: 0 } }) };
});
vi.mock('react-native-reanimated', async () => {
  const { View } = await import('react-native');
  return {
    default: { View },
    Extrapolation: { CLAMP: 'clamp' },
    cancelAnimation: vi.fn(),
    interpolate: () => 1,
    useAnimatedStyle: (updater: () => object) => updater(),
    useSharedValue: (value: unknown) => React.useRef({ value }).current,
    withSpring: (value: number) => value,
    withTiming: (value: number) => value,
  };
});
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));

afterEach(cleanup);
const noOp = () => undefined;
const ShellView = ({ children }: ShellContextInterface) => <>{children}</>;
const Content = ({ id }: { id: string }) => (
  <button data-testid={id} data-active={String(useScreenActive())}>
    {id}
  </button>
);
const Frame = ({ children, depth, id }: React.PropsWithChildren<{ depth: number; id: string }>) => (
  <ScreenLayerHost depth={depth} kind="frame">
    <ShellHost dismiss={noOp} metadata={{ view: ShellView }} onPresentationComplete={noOp} phase="visible">
      <Content id={id} />
      {children}
    </ShellHost>
  </ScreenLayerHost>
);
const Tree = ({ nested = true, modal = false }: { nested?: boolean; modal?: boolean }) => (
  <React.StrictMode>
    <ScreenCompositor>
      <ScreenLayerHost kind="application">
        <Content id="application" />
      </ScreenLayerHost>
      <Frame depth={0} id="outer">
        {nested && <Frame depth={1} id="inner" />}
      </Frame>
      {modal && (
        <ScreenLayerHost kind="modal">
          <Content id="modal" />
        </ScreenLayerHost>
      )}
    </ScreenCompositor>
  </React.StrictMode>
);
const panEnabled = (id: string) =>
  screen.getByTestId(id).closest('[data-pan-enabled]')?.getAttribute('data-pan-enabled');
const active = (id: string) => screen.getByTestId(id).getAttribute('data-active');
const blocked = (id: string) => {
  let ancestor = screen.getByTestId(id).parentElement;
  while (ancestor) {
    if (['none', 'box-only'].includes(ancestor.getAttribute('data-pointer') ?? '')) return true;
    ancestor = ancestor.parentElement;
  }
  return false;
};

describe('ShellHost gesture ownership in the real screen compositor', () => {
  it.each(['presenting', 'dismissing', 'hidden'] as const)('keeps the %s shell gesture disabled', (phase) => {
    render(
      <ScreenCompositor>
        <ScreenLayerHost kind="frame">
          <ShellHost dismiss={noOp} metadata={{ view: ShellView }} onPresentationComplete={noOp} phase={phase}>
            <Content id="transition" />
          </ShellHost>
        </ScreenLayerHost>
      </ScreenCompositor>,
    );
    expect(panEnabled('transition')).toBe('false');
    expect(blocked('transition')).toBe(phase !== 'presenting');
  });

  it('passes touches to the active nested shell while suspending the ancestor dismiss gesture', () => {
    const view = render(<Tree />);
    expect(active('outer')).toBe('false');
    expect(active('inner')).toBe('true');
    expect(blocked('inner')).toBe(false);
    expect(blocked('application')).toBe(true);
    expect(panEnabled('outer')).toBe('false');
    expect(panEnabled('inner')).toBe('true');

    view.rerender(<Tree nested={false} />);
    expect(active('outer')).toBe('true');
    expect(blocked('outer')).toBe(false);
    expect(panEnabled('outer')).toBe('true');

    view.rerender(<Tree />);
    expect(active('outer')).toBe('false');
    expect(blocked('inner')).toBe(false);
    expect(panEnabled('outer')).toBe('false');
    expect(panEnabled('inner')).toBe('true');
  });

  it('suspends both shell gestures for a modal and restores only the deepest one after close', () => {
    const view = render(<Tree modal />);
    expect(active('modal')).toBe('true');
    expect(blocked('inner')).toBe(true);
    expect(panEnabled('outer')).toBe('false');
    expect(panEnabled('inner')).toBe('false');

    view.rerender(<Tree />);
    expect(active('outer')).toBe('false');
    expect(active('inner')).toBe('true');
    expect(blocked('inner')).toBe(false);
    expect(panEnabled('outer')).toBe('false');
    expect(panEnabled('inner')).toBe('true');
  });
});
