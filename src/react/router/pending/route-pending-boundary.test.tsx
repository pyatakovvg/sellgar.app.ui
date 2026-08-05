import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routerMocks = vi.hoisted(() => {
  return {
    useLocation: vi.fn(),
    useNavigation: vi.fn(),
  };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();

  return {
    ...actual,
    useLocation: routerMocks.useLocation,
    useNavigation: routerMocks.useNavigation,
  };
});

import { RoutePendingBoundary } from './route-pending-boundary.tsx';

describe('RoutePendingBoundary', () => {
  afterEach(() => {
    routerMocks.useLocation.mockReset();
    routerMocks.useNavigation.mockReset();
  });

  it('renders fallback during route transition', () => {
    mockLocation('/reports', '');
    mockNavigation('loading', '/terminals', '');

    render(
      <RoutePendingBoundary fallback={<div>Route fallback</div>} pathname={'/'}>
        <div>Route content</div>
      </RoutePendingBoundary>,
    );

    expect(screen.getByText('Route fallback')).toBeInTheDocument();
    expect(screen.queryByText('Route content')).not.toBeInTheDocument();
  });

  it('keeps content during same route revalidation', () => {
    mockLocation('/reports', '?page=1');
    mockNavigation('loading', '/reports', '?page=1');

    render(
      <RoutePendingBoundary fallback={<div>Route fallback</div>} pathname={'/'}>
        <div>Route content</div>
      </RoutePendingBoundary>,
    );

    expect(screen.queryByText('Route fallback')).not.toBeInTheDocument();
    expect(screen.getByText('Route content')).toBeInTheDocument();
  });

  it('keeps content during current route search revalidation', () => {
    mockLocation('/reports', '?page=1');
    mockNavigation('loading', '/reports', '?page=2');

    render(
      <RoutePendingBoundary fallback={<div>Route fallback</div>} pathname={'/'}>
        <div>Route content</div>
      </RoutePendingBoundary>,
    );

    expect(screen.queryByText('Route fallback')).not.toBeInTheDocument();
    expect(screen.getByText('Route content')).toBeInTheDocument();
  });

  it('keeps content during same route revalidation with router basename', () => {
    mockLocation('/', '');
    mockNavigation('loading', '/terminals-management', '');

    render(
      <RoutePendingBoundary basePath={'/terminals-management'} fallback={<div>Route fallback</div>} pathname={'/'}>
        <div>Route content</div>
      </RoutePendingBoundary>,
    );

    expect(screen.queryByText('Route fallback')).not.toBeInTheDocument();
    expect(screen.getByText('Route content')).toBeInTheDocument();
  });

  it('keeps parent content during nested route navigation inside the same child segment', () => {
    mockLocation('/terminals', '');
    mockNavigation('loading', '/terminals/registrations', '');

    render(
      <RoutePendingBoundary fallback={<div>Route fallback</div>} pathname={'/'}>
        <div>Route content</div>
      </RoutePendingBoundary>,
    );

    expect(screen.queryByText('Route fallback')).not.toBeInTheDocument();
    expect(screen.getByText('Route content')).toBeInTheDocument();
  });

  it('renders nested route fallback when the child segment changes inside boundary path', () => {
    mockLocation('/terminals', '');
    mockNavigation('loading', '/terminals/registrations', '');

    render(
      <RoutePendingBoundary fallback={<div>Route fallback</div>} pathname={'/terminals'}>
        <div>Route content</div>
      </RoutePendingBoundary>,
    );

    expect(screen.getByText('Route fallback')).toBeInTheDocument();
    expect(screen.queryByText('Route content')).not.toBeInTheDocument();
  });
});

const mockLocation = (pathname: string, search: string): void => {
  routerMocks.useLocation.mockReturnValue({
    hash: '',
    key: 'current',
    pathname,
    search,
    state: null,
  });
};

const mockNavigation = (state: 'idle' | 'loading' | 'submitting', pathname: string, search: string): void => {
  routerMocks.useNavigation.mockReturnValue({
    formAction: undefined,
    formData: undefined,
    formEncType: undefined,
    formMethod: undefined,
    json: undefined,
    location: {
      hash: '',
      key: 'next',
      pathname,
      search,
      state: null,
    },
    state,
    text: undefined,
  });
};
