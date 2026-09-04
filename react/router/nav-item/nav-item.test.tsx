import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useNavigationControl } from '../hook/use-navigation-control';
import { NavItem } from './nav-item.tsx';

vi.mock('../hook/use-navigation-control', () => ({ useNavigationControl: vi.fn() }));

describe('NavItem', () => {
  it('passes viewTransition to the shared navigation control', () => {
    vi.mocked(useNavigationControl).mockReturnValue({
      execute: vi.fn(async () => undefined),
      isActive: false,
      isPending: false,
      target: {} as never,
    });
    const navigation = () => ({}) as never;

    render(
      <NavItem navigation={navigation} viewTransition>
        {() => null}
      </NavItem>,
    );

    expect(useNavigationControl).toHaveBeenCalledWith(navigation, false, true);
  });
});
