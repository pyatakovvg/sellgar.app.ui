import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ApplicationRouterHistoryEntry } from '../../../../core/application/lifecycle/application';
import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';
import type { ModuleMetadata } from '../../../module/declaration/module';
import type { NativeRouterBridge } from '../../bridge/native-router-bridge';
import { NativeNavigationHost } from './native-navigation-host.tsx';

vi.mock('react-native', () => ({
  BackHandler: {
    addEventListener: () => ({ remove: vi.fn() }),
    exitApp: vi.fn(),
  },
  ToastAndroid: {
    SHORT: 0,
    show: vi.fn(),
  },
}));

vi.mock('../router-host', () => ({
  RouterPresentationHost: ({ children }: { readonly children: (value: unknown) => React.ReactNode }) => (
    <>{children({ components: {} })}</>
  ),
}));

vi.mock('./native-route-projection-host.tsx', () => ({
  NativeRouteProjectionHost: ({
    entries,
  }: {
    readonly entries: readonly ApplicationRouterHistoryEntry<ModuleMetadata>[];
  }) => <div>{entries.map((entry) => entry.key).join(',')}</div>,
}));

describe('NativeNavigationHost', () => {
  it('reads current core history again when the native bridge commits retained focus', () => {
    let bridgeListener: (() => void) | undefined;
    let bridgeSnapshot = { ...TRANSPORT_SNAPSHOT };
    let entries = [createEntry('activation:1')];
    const runtime = createRuntime();
    const bridge = {
      back: vi.fn(async () => undefined),
      completePresentation: vi.fn(),
      getPresentationRevision: () => 0,
      getSnapshot: () => bridgeSnapshot,
      registerDriver: () => () => undefined,
      subscribe: (listener: () => void) => {
        bridgeListener = listener;
        return () => undefined;
      },
    } as unknown as NativeRouterBridge;

    render(
      <NativeNavigationHost
        bridge={bridge}
        components={{}}
        current={undefined}
        decision={null}
        getHistoryEntries={() => entries}
        onPresentationComplete={() => undefined}
        runtime={runtime}
      />,
    );

    entries = [createEntry('activation:1', 'retained'), createEntry('activation:2')];
    bridgeSnapshot = { ...TRANSPORT_SNAPSHOT, index: 1 };
    act(() => bridgeListener?.());

    expect(screen.getByText('activation:1,activation:2')).toBeInTheDocument();
  });

  it('reads current core history again when RouterRuntime emits', () => {
    let runtimeListener: (() => void) | undefined;
    let runtimeSnapshot = Object.freeze({ error: null, phase: 'active' as const });
    let entries = [createEntry('activation:1')];
    const runtime = {
      getBranchSnapshot: () => ({
        child: null,
        childPending: false,
        pending: false,
        pendingLocalChange: null,
        routes: [],
      }),
      getPendingNavigation: () => null,
      getSnapshot: () => runtimeSnapshot,
      subscribe: (listener: () => void) => {
        runtimeListener = listener;
        return () => undefined;
      },
    } as unknown as RouterRuntime<ModuleMetadata>;
    const bridge = {
      back: vi.fn(async () => undefined),
      completePresentation: vi.fn(),
      getPresentationRevision: () => 0,
      getSnapshot: () => TRANSPORT_SNAPSHOT,
      registerDriver: () => () => undefined,
      subscribe: () => () => undefined,
    } as unknown as NativeRouterBridge;

    render(
      <NativeNavigationHost
        bridge={bridge}
        components={{}}
        current={undefined}
        decision={null}
        getHistoryEntries={() => entries}
        onPresentationComplete={() => undefined}
        runtime={runtime}
      />,
    );

    expect(screen.getByText('activation:1')).toBeInTheDocument();

    entries = [createEntry('activation:1', 'retained')];
    runtimeSnapshot = Object.freeze({ error: null, phase: 'pending' as const });
    act(() => runtimeListener?.());

    expect(screen.getByText('activation:1')).toBeInTheDocument();

    entries = [createEntry('activation:1', 'retained'), createEntry('activation:2')];
    runtimeSnapshot = Object.freeze({ error: null, phase: 'active' as const });
    act(() => runtimeListener?.());

    expect(screen.getByText('activation:1,activation:2')).toBeInTheDocument();
  });

  it('keeps the retained projection mounted while a nested activation has no focused history entry', () => {
    let runtimeListener: (() => void) | undefined;
    let runtimeSnapshot = Object.freeze({ error: null, phase: 'active' as const });
    let entries = [createEntry('activation:1')];
    const runtime = {
      getBranchSnapshot: () => ({
        child: null,
        childPending: false,
        pending: false,
        pendingLocalChange: null,
        routes: [],
      }),
      getPendingNavigation: () => null,
      getSnapshot: () => runtimeSnapshot,
      subscribe: (listener: () => void) => {
        runtimeListener = listener;
        return () => undefined;
      },
    } as unknown as RouterRuntime<ModuleMetadata>;
    const bridge = {
      back: vi.fn(async () => undefined),
      completePresentation: vi.fn(),
      getPresentationRevision: () => 0,
      getSnapshot: () => TRANSPORT_SNAPSHOT,
      registerDriver: () => () => undefined,
      subscribe: () => () => undefined,
    } as unknown as NativeRouterBridge;

    render(
      <NativeNavigationHost
        bridge={bridge}
        components={{ fallback: <div>fallback</div> }}
        current={undefined}
        decision={null}
        getHistoryEntries={() => entries}
        onPresentationComplete={() => undefined}
        runtime={runtime}
      />,
    );

    entries = [createEntry('activation:1', 'retained')];
    runtimeSnapshot = Object.freeze({ error: null, phase: 'pending' as const });
    act(() => runtimeListener?.());

    expect(screen.getByText('activation:1')).toBeInTheDocument();
    expect(screen.queryByText('fallback')).not.toBeInTheDocument();

    entries = [createEntry('activation:1', 'retained'), createEntry('activation:2')];
    runtimeSnapshot = Object.freeze({ error: null, phase: 'active' as const });
    act(() => runtimeListener?.());

    expect(screen.getByText('activation:1,activation:2')).toBeInTheDocument();
  });
});

const createRuntime = (): RouterRuntime<ModuleMetadata> => {
  const snapshot = Object.freeze({ error: null, phase: 'active' as const });

  return {
    getBranchSnapshot: () => ({
      child: null,
      childPending: false,
      pending: false,
      pendingLocalChange: null,
      routes: [],
    }),
    getPendingNavigation: () => null,
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
  } as unknown as RouterRuntime<ModuleMetadata>;
};

const TRANSPORT_SNAPSHOT = Object.freeze({
  action: null,
  backInProgress: false,
  index: 0,
  length: 1,
  location: null,
});

const createEntry = (
  key: string,
  phase: 'focused' | 'retained' = 'focused',
): ApplicationRouterHistoryEntry<ModuleMetadata> => {
  return {
    key,
    phase,
    tree: { routes: [] },
  } as unknown as ApplicationRouterHistoryEntry<ModuleMetadata>;
};
