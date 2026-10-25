import { render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as structure from './viewport-structure.tsx';
import { Viewport } from './viewport.tsx';

const { list } = vi.hoisted(() => ({ list: vi.fn() }));

// Native rendering ports are controlled; structure resolution and Viewport remain real.
vi.mock('react-native', () => ({
  View: ({ children }: React.PropsWithChildren) => <>{children}</>,
  VirtualizedList: (props: unknown) => {
    list(props);
    return null;
  },
  StyleSheet: { create: (styles: object) => styles },
  Animated: { Value: class {} },
}));
vi.mock('react-native-keyboard-controller', () => ({
  KeyboardStickyView: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock('../../../keyboard/rendering/keyboard-scroll-view', () => ({
  KeyboardScrollView: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock('../../../router/rendering/shell-scroll-view', () => ({
  ShellScrollView: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock('../../../router/runtime/shell-runtime-context', () => ({ useOptionalShellRuntime: () => null }));
vi.mock('../../../screen/runtime/screen-activity-context', () => ({ useScreenActive: () => true }));

afterEach(() => {
  vi.restoreAllMocks();
  list.mockClear();
});

describe('Viewport collection projection', () => {
  it('reuses the structure and virtualized data when children have not changed', () => {
    const resolve = vi.spyOn(structure, 'resolveViewportStructure');
    const children = (
      <Viewport.Collection>
        {Array.from({ length: 1000 }, (_, index) => (
          <Viewport.Collection.Item key={index}>{index}</Viewport.Collection.Item>
        ))}
      </Viewport.Collection>
    );
    const view = render(<Viewport>{children}</Viewport>);
    const initialData = list.mock.lastCall![0].data;
    view.rerender(<Viewport>{children}</Viewport>);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(list.mock.lastCall![0].data).toBe(initialData);
    expect(initialData).toHaveLength(1000);
  });

  it('rebuilds changed children while preserving keyed order, sticky and empty states', () => {
    const children = (ids: string[]) => (
      <Viewport.Collection>
        <Viewport.Collection.Empty>empty</Viewport.Collection.Empty>
        <Viewport.Collection.Item.Sticky key="header">header</Viewport.Collection.Item.Sticky>
        {ids.map((id) => (
          <Viewport.Collection.Item key={id}>{id}</Viewport.Collection.Item>
        ))}
      </Viewport.Collection>
    );
    const view = render(<Viewport>{children(['a', 'b'])}</Viewport>);
    const initial = list.mock.lastCall![0].data as readonly structure.ViewportFlowEntry[];
    view.rerender(<Viewport>{children(['b', 'a', 'c'])}</Viewport>);
    const next = list.mock.lastCall![0].data as readonly structure.ViewportFlowEntry[];
    expect(next.map((entry) => (entry.node as React.ReactElement<React.PropsWithChildren>).props.children)).toEqual([
      'header',
      'b',
      'a',
      'c',
    ]);
    expect(next[1].key).toBe(initial[2].key);
    expect(next[2].key).toBe(initial[1].key);
    expect(list.mock.lastCall![0].stickyHeaderIndices).toEqual([0]);
    view.rerender(
      <Viewport>
        <Viewport.Collection>
          <Viewport.Collection.Empty>empty</Viewport.Collection.Empty>
        </Viewport.Collection>
      </Viewport>,
    );
    expect(list.mock.lastCall![0].data.map((entry: structure.ViewportFlowEntry) => entry.node)).toEqual(['empty']);
  });
});
