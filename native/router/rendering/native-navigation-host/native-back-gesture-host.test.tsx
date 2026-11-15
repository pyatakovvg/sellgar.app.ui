import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const gesture = vi.hoisted(() => ({
  release: null as ((event: { canceled: boolean; translationX: number; velocityX: number }) => void) | null,
  rtl: false,
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  I18nManager: {
    get isRTL() {
      return gesture.rtl;
    },
  },
  View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  StyleSheet: { create: (styles: object) => styles },
}));
vi.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: React.PropsWithChildren) => children,
  usePanGesture: (options: { onDeactivate: typeof gesture.release }) => {
    gesture.release = options.onDeactivate;
    return options;
  },
}));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));

import { NativeBackGestureHost } from './native-back-gesture-host.tsx';

describe('native Back gesture admission', () => {
  it.each([false, true])('only requests Back after a committed gesture (RTL: %s)', (rtl) => {
    gesture.rtl = rtl;
    const requestBack = vi.fn();
    const view = render(
      <NativeBackGestureHost requestBack={requestBack}>
        <span>screen</span>
      </NativeBackGestureHost>,
    );
    try {
      const direction = rtl ? -1 : 1;
      gesture.release!({ canceled: true, translationX: direction * 100, velocityX: direction * 700 });
      gesture.release!({ canceled: false, translationX: direction * 20, velocityX: direction * 200 });
      gesture.release!({ canceled: false, translationX: direction * -100, velocityX: direction * -700 });
      expect(requestBack).not.toHaveBeenCalled();
      gesture.release!({ canceled: false, translationX: direction * 80, velocityX: 0 });
      expect(requestBack).toHaveBeenCalledOnce();
      gesture.release!({ canceled: false, translationX: direction * 20, velocityX: direction * 700 });
      expect(requestBack).toHaveBeenCalledTimes(2);
    } finally {
      view.unmount();
    }
  });
});
