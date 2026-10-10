import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useNavigationControl } from '../hook/use-navigation-control';
import { NavItem } from './nav-item.tsx';

vi.mock('../hook/use-navigation-control', () => ({ useNavigationControl: vi.fn() }));

describe('NavItem', () => {
  const navigation = () => ({}) as never;

  const mockControl = () => {
    vi.mocked(useNavigationControl).mockReturnValue({
      execute: vi.fn(async () => undefined),
      isActive: false,
      isPending: false,
      target: {} as never,
    });
  };

  it('passes viewTransition to the shared navigation control', () => {
    mockControl();

    render(
      <NavItem navigation={navigation} viewTransition>
        {() => null}
      </NavItem>,
    );

    expect(useNavigationControl).toHaveBeenCalledWith(navigation, true, true);
  });

  it('renders its child without adding a DOM wrapper', () => {
    mockControl();

    const { container } = render(<NavItem navigation={navigation}>{() => <button>Terminals</button>}</NavItem>);

    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(screen.getByRole('button'));
  });

  it('forwards parent injected props to the rendered child', () => {
    mockControl();

    render(
      <NavItem data-size={'sm'} navigation={navigation}>
        {() => <button>Terminals</button>}
      </NavItem>,
    );

    expect(screen.getByRole('button')).toHaveAttribute('data-size', 'sm');
  });
});
