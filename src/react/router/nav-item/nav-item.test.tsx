import 'reflect-metadata';

import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { UseBindings } from '../../../di/composition/use-bindings';
import { Injectable } from '../../../di/injection/decorators';
import { RouterServiceBindings } from '../../../router/service/router-service';
import { RouterServiceControllerInterface } from '../../../router/service/router-service-controller';
import { RuntimeScopeProvider } from '../../../runtime/react';
import { ApplicationScope } from '../../../runtime/scope/kind';

import { NavItem } from './nav-item.tsx';

const routerMocks = vi.hoisted(() => {
  return {
    useHref: vi.fn(),
    useNavigation: vi.fn(),
  };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();

  return {
    ...actual,
    useHref: routerMocks.useHref,
    useNavigation: routerMocks.useNavigation,
  };
});

describe('NavItem', () => {
  beforeEach(() => {
    routerMocks.useHref.mockImplementation((to: string) => to);
  });

  afterEach(() => {
    routerMocks.useHref.mockReset();
    routerMocks.useNavigation.mockReset();
  });

  it('provides active state for current target without adding DOM wrapper', () => {
    const { wrapper } = createNavItemTestContext('/terminals');

    mockNavigation('idle');

    const { container } = render(
      <NavItem to={'/terminals'}>
        {({ isActive, isPending, to }) => (
          <button data-pending={String(isPending)} data-to={to}>
            {String(isActive)}
          </button>
        )}
      </NavItem>,
      { wrapper },
    );

    expect(screen.getByRole('button')).toHaveTextContent('true');
    expect(screen.getByRole('button')).toHaveAttribute('data-pending', 'false');
    expect(screen.getByRole('button')).toHaveAttribute('data-to', '/terminals');
    expect(container.children).toHaveLength(1);
  });

  it('forwards parent injected props to rendered child element', () => {
    const { wrapper } = createNavItemTestContext('/terminals');

    mockNavigation('idle');

    render(
      <NavItem size={'sm'} to={'/terminals'}>
        {() => <ForwardedPropsButton />}
      </NavItem>,
      { wrapper },
    );

    expect(screen.getByRole('button')).toHaveAttribute('data-size', 'sm');
  });

  it('provides pending state for target navigation', () => {
    const { wrapper } = createNavItemTestContext('/employees');

    mockNavigation('loading', '/employees/invitations');

    render(
      <NavItem to={'/employees/invitations'}>
        {({ isActive, isPending }) => (
          <button data-active={String(isActive)} data-pending={String(isPending)}>
            invitations
          </button>
        )}
      </NavItem>,
      { wrapper },
    );

    expect(screen.getByRole('button')).toHaveAttribute('data-active', 'false');
    expect(screen.getByRole('button')).toHaveAttribute('data-pending', 'true');
  });

  it('uses navigation location as pending signal', () => {
    const { wrapper } = createNavItemTestContext('/employees');

    mockNavigation('idle', '/employees/invitations');

    render(
      <NavItem to={'/employees/invitations'}>
        {({ isPending }) => <button data-pending={String(isPending)}>invitations</button>}
      </NavItem>,
      { wrapper },
    );

    expect(screen.getByRole('button')).toHaveAttribute('data-pending', 'true');
  });

  it('strips router base path from pending target pathname', () => {
    const { wrapper } = createNavItemTestContext('/employees');

    mockHref('/terminals-management/employees/invitations');
    mockNavigation('idle', '/terminals-management/employees/invitations');

    render(
      <NavItem to={'/employees/invitations'}>
        {({ isPending }) => <button data-pending={String(isPending)}>invitations</button>}
      </NavItem>,
      { wrapper },
    );

    expect(screen.getByRole('button')).toHaveAttribute('data-pending', 'true');
  });

  it('uses exact matching by default', () => {
    const { wrapper } = createNavItemTestContext('/employees/invitations');

    mockNavigation('loading', '/employees/invitations');

    render(
      <NavItem to={'/employees'}>
        {({ isActive, isPending }) => (
          <button data-active={String(isActive)} data-pending={String(isPending)}>
            employees
          </button>
        )}
      </NavItem>,
      { wrapper },
    );

    expect(screen.getByRole('button')).toHaveAttribute('data-active', 'false');
    expect(screen.getByRole('button')).toHaveAttribute('data-pending', 'false');
  });

  it('supports branch matching when end is false', () => {
    const { wrapper } = createNavItemTestContext('/employees/invitations');

    mockNavigation('loading', '/employees/invitations');

    render(
      <NavItem end={false} to={'/employees'}>
        {({ isActive, isPending }) => (
          <button data-active={String(isActive)} data-pending={String(isPending)}>
            employees
          </button>
        )}
      </NavItem>,
      { wrapper },
    );

    expect(screen.getByRole('button')).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('button')).toHaveAttribute('data-pending', 'true');
  });
});

const createNavItemTestContext = (pathname: string): NavItemTestContext => {
  const scope = new ApplicationScope();

  scope.activate(TestNavItemOwner);
  scope.get(RouterServiceControllerInterface).syncLocation({
    hash: '',
    key: 'current',
    params: {},
    pathname,
    search: '',
    state: null,
  });

  return {
    wrapper: ({ children }) => {
      return <RuntimeScopeProvider scope={scope}>{children}</RuntimeScopeProvider>;
    },
  };
};

interface NavItemTestContext {
  readonly wrapper: React.FC<React.PropsWithChildren>;
}

const ForwardedPropsButton: React.FC<{ readonly size?: string }> = ({ size }) => {
  return <button data-size={size}>terminals</button>;
};

const mockNavigation = (state: 'idle' | 'loading' | 'submitting', pathname?: string): void => {
  routerMocks.useNavigation.mockReturnValue({
    formAction: undefined,
    formData: undefined,
    formEncType: undefined,
    formMethod: undefined,
    json: undefined,
    location:
      pathname === undefined
        ? undefined
        : {
            hash: '',
            key: 'next',
            pathname,
            search: '',
            state: null,
          },
    state,
    text: undefined,
  });
};

const mockHref = (href: string): void => {
  routerMocks.useHref.mockReturnValue(href);
};

class TestNavItemBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    const bindings = new RouterServiceBindings();

    bindings.register(registry);
  }
}

@Injectable()
@UseBindings(TestNavItemBindings)
class TestNavItemOwner {}
