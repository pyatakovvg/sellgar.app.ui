import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useNavigationControl } from '../hook/use-navigation-control';
import { NavLink } from './nav-link.tsx';

vi.mock('../hook/use-navigation-control', () => ({ useNavigationControl: vi.fn() }));
vi.mock('../runtime/navigation-state-context', () => ({
  useNavigationState: () => ({ createHref: () => '/target' }),
}));

describe('NavLink', () => {
  const execute = vi.fn(async () => undefined);

  beforeEach(() => {
    execute.mockClear();
    vi.mocked(useNavigationControl).mockReturnValue({
      execute,
      isActive: true,
      isPending: false,
      target: {} as never,
    });
  });

  it('provides native anchor attributes and executes an ordinary primary click', () => {
    render(<NavLink navigation={() => ({}) as never}>{({ anchor }) => <a {...anchor}>target</a>}</NavLink>);

    const anchor = screen.getByRole('link', { name: 'target' });

    expect(anchor).toHaveAttribute('href', '/target');
    expect(anchor).toHaveAttribute('aria-current', 'page');
    fireEvent.click(anchor);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('preserves modified and consumer-cancelled clicks', () => {
    let onModifiedClick: React.MouseEventHandler<HTMLAnchorElement> | undefined;
    const view = render(
      <NavLink navigation={() => ({}) as never}>
        {({ anchor }) => {
          onModifiedClick = anchor.onClick;

          return <a {...anchor}>modified</a>;
        }}
      </NavLink>,
    );

    onModifiedClick!({
      altKey: false,
      button: 0,
      ctrlKey: true,
      currentTarget: { hasAttribute: () => false, target: '' },
      defaultPrevented: false,
      metaKey: false,
      preventDefault: vi.fn(),
      shiftKey: false,
    } as never);
    expect(execute).not.toHaveBeenCalled();

    view.rerender(
      <NavLink navigation={() => ({}) as never}>
        {({ anchor }) => (
          <a
            {...anchor}
            onClick={(event) => {
              event.preventDefault();
              anchor.onClick(event);
            }}
          >
            cancelled
          </a>
        )}
      </NavLink>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'cancelled' }));
    expect(execute).not.toHaveBeenCalled();
  });
});
