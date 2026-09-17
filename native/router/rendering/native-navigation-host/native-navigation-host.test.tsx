import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationNavigationSnapshot } from '../../../../core/application/lifecycle/application';
import type { NativePresentationRuntime } from '../../runtime/native-presentation-runtime';
import { NativeNavigationHost } from './native-navigation-host.tsx';

vi.mock('../router-host', () => ({
  RouterPresentationHost: ({ children }: { children: (value: object) => React.ReactNode }) => <>{children({})}</>,
}));
vi.mock('./native-back-gesture-host.tsx', () => ({
  NativeBackGestureHost: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock('./native-route-projection-host.tsx', () => ({
  NativeRouteProjectionHost: ({ runtime }: { runtime: { label: string } }) => <div>{runtime.label}</div>,
}));

describe('NativeNavigationHost', () => {
  it('observes presentation snapshots, delegates the same projection runtime and unsubscribes', () => {
    let snapshot: ApplicationNavigationSnapshot = { decision: null, navigation: undefined, pending: null };
    const listeners = new Set<() => void>();
    const routes = { label: 'projected screen' };
    const presentationRuntime = {
      getNavigationSnapshot: () => snapshot,
      subscribeNavigation: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      routes,
    } as unknown as NativePresentationRuntime;
    const subscribe = vi.fn();
    const runtime = { subscribe } as unknown as React.ComponentProps<typeof NativeNavigationHost>['runtime'];
    const view = render(
      <NativeNavigationHost
        components={{ fallback: <div>initial preparation</div> }}
        presentationRuntime={presentationRuntime}
        requestBack={vi.fn()}
        runtime={runtime}
      />,
    );
    expect(screen.getByText('initial preparation')).toBeInTheDocument();
    expect(listeners.size).toBe(1);

    act(() => {
      snapshot = { ...snapshot, pending: {} as NonNullable<ApplicationNavigationSnapshot['pending']> };
      listeners.forEach((listener) => listener());
    });
    expect(screen.getByText('projected screen')).toBeInTheDocument();
    expect(screen.queryByText('initial preparation')).not.toBeInTheDocument();
    expect(subscribe).not.toHaveBeenCalled();

    act(() => {
      snapshot = { ...snapshot, navigation: snapshot.pending!, pending: null };
      listeners.forEach((listener) => listener());
    });
    expect(screen.getByText('projected screen')).toBeInTheDocument();
    view.unmount();
    expect(listeners.size).toBe(0);
  });
});
