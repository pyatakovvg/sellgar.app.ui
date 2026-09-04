import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useNavigationControl } from '../hook/use-navigation-control';
import { TabItem } from './tab-item.tsx';

vi.mock('../hook/use-navigation-control', () => ({ useNavigationControl: vi.fn() }));

describe('TabItem', () => {
  it('publishes native tab semantics from the shared navigation control', () => {
    const execute = vi.fn(async () => undefined);
    const navigation = () => ({}) as never;

    vi.mocked(useNavigationControl).mockReturnValue({
      execute,
      isActive: true,
      isPending: false,
      isRoutePending: false,
      target: {} as never,
    });

    let state: Parameters<Parameters<typeof TabItem>[0]['children']>[0] | undefined;

    render(
      <TabItem navigation={navigation}>
        {(value) => {
          state = value;
          return null;
        }}
      </TabItem>,
    );

    expect(useNavigationControl).toHaveBeenCalledWith(navigation, false);
    expect(state?.tab.accessibilityRole).toBe('tab');
    expect(state?.tab.accessibilityState).toEqual({ busy: false, selected: true });

    state?.tab.onPress();
    expect(execute).toHaveBeenCalledOnce();
  });

  it('publishes pending state when the tab route is targeted by another navigation control', () => {
    vi.mocked(useNavigationControl).mockReturnValue({
      execute: vi.fn(async () => undefined),
      isActive: false,
      isPending: false,
      isRoutePending: true,
      target: {} as never,
    });

    let state: Parameters<Parameters<typeof TabItem>[0]['children']>[0] | undefined;

    render(
      <TabItem navigation={() => ({}) as never}>
        {(value) => {
          state = value;
          return null;
        }}
      </TabItem>,
    );

    expect(state?.isPending).toBe(true);
    expect(state?.tab.accessibilityState.busy).toBe(true);
  });
});
