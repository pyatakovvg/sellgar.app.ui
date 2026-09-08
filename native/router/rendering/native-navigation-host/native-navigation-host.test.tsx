import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type {
  ApplicationRouterHistoryEntry,
  ApplicationRouterRuntimeEntry,
} from '../../../../core/application/lifecycle/application';
import type { NavigationState } from '../../../../core/router/runtime/navigation-state';
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
    pendingTree,
  }: {
    readonly entries: readonly ApplicationRouterHistoryEntry<ModuleMetadata>[];
    readonly pendingTree: unknown;
  }) => <div>{`${entries.map((entry) => entry.key).join(',')}:${pendingTree ? 'pending-tree' : 'no-tree'}`}</div>,
}));

describe('NativeNavigationHost', () => {
  it('projects the authoritative core entries supplied by its parent snapshot', () => {
    let entries = [createHistoryEntry('activation:1')];
    const props = createProps(() => entries);
    const view = render(<NativeNavigationHost {...props} />);

    expect(screen.getByText('activation:1:no-tree')).toBeInTheDocument();

    entries = [createHistoryEntry('activation:1', 'retained'), createHistoryEntry('activation:2')];
    view.rerender(<NativeNavigationHost {...props} />);

    expect(screen.getByText('activation:1,activation:2:no-tree')).toBeInTheDocument();
  });

  it('projects a retained activation without subscribing to RouterRuntime a second time', () => {
    const tree = { routes: [] };
    const subscribe = vi.fn(() => () => undefined);
    const pending = {} as NavigationState;
    const runtime = {
      findActivation: () => ({ getTreeSnapshot: () => tree }),
      getSnapshot: () => Object.freeze({ error: null, phase: 'active' as const }),
      subscribe,
    } as unknown as RouterRuntime<ModuleMetadata>;

    render(
      <NativeNavigationHost
        {...createProps(() => [createHistoryEntry('activation:1')])}
        pending={pending}
        runtime={runtime}
      />,
    );

    expect(screen.getByText('activation:1:pending-tree')).toBeInTheDocument();
    expect(subscribe).not.toHaveBeenCalled();
  });
});

const createProps = (getHistoryEntries: () => readonly ApplicationRouterHistoryEntry<ModuleMetadata>[]) => ({
  bridge: {
    back: vi.fn(async () => undefined),
    registerDriver: () => () => undefined,
  } as unknown as NativeRouterBridge,
  components: {},
  current: undefined,
  decision: null,
  getHistoryEntries,
  getRuntimeEntries: () => [] as readonly ApplicationRouterRuntimeEntry<ModuleMetadata>[],
  navigation: Object.freeze({ action: null, backInProgress: false, entries: [], index: 0 }),
  onPresentationComplete: () => undefined,
  pending: null,
  runtime: createRuntime(),
  source: undefined,
});

const createRuntime = (): RouterRuntime<ModuleMetadata> => {
  return {
    findActivation: () => null,
    getSnapshot: () => Object.freeze({ error: null, phase: 'active' as const }),
    subscribe: () => () => undefined,
  } as unknown as RouterRuntime<ModuleMetadata>;
};

const createHistoryEntry = (
  key: string,
  phase: 'focused' | 'retained' = 'focused',
): ApplicationRouterHistoryEntry<ModuleMetadata> => {
  return {
    key,
    phase,
    tree: { routes: [] },
  } as unknown as ApplicationRouterHistoryEntry<ModuleMetadata>;
};
