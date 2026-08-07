import 'reflect-metadata';

import { render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { BindingModuleInterface } from '../../../di/binding/binding-module';
import { Injectable } from '../../../di/injection/decorators';
import { UseBindings } from '../../../di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { ApplicationScope } from '../../../runtime/scope/kind';
import { RuntimeScopeProvider } from '../../../runtime/react';
import { GuardInterface } from '../../contract/guard';

import { useGuard } from '../use-guard';

import { Guarded } from './';

describe('Guarded', () => {
  it('renders children when all guards pass', async () => {
    const fixture = createGuardedFixture({
      first: true,
      second: true,
    });

    render(
      fixture.render(
        <Guarded by={[FirstGuardInterface, SecondGuardInterface]} fallback={<div>Blocked</div>}>
          <div>Allowed</div>
        </Guarded>,
      ),
    );

    await waitFor(() => {
      expect(screen.getByText('Allowed')).toBeInTheDocument();
    });
    expect(screen.queryByText('Blocked')).not.toBeInTheDocument();
  });

  it('renders fallback when any guard fails', async () => {
    const fixture = createGuardedFixture({
      first: true,
      second: false,
    });

    render(
      fixture.render(
        <Guarded by={[FirstGuardInterface, SecondGuardInterface]} fallback={<div>Blocked</div>}>
          <div>Allowed</div>
        </Guarded>,
      ),
    );

    await waitFor(() => {
      expect(screen.getByText('Blocked')).toBeInTheDocument();
    });
    expect(screen.queryByText('Allowed')).not.toBeInTheDocument();
  });
});

describe('useGuard', () => {
  it('returns true when combined guards pass', async () => {
    const fixture = createGuardedFixture({
      first: true,
      second: true,
    });

    const { result } = renderHook(() => useGuard([FirstGuardInterface, SecondGuardInterface]), {
      wrapper: ({ children }) => fixture.render(children),
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });
});

interface GuardedFixtureOptions {
  readonly first: boolean;
  readonly second: boolean;
}

interface GuardedFixture {
  readonly render: (children: React.ReactNode) => React.ReactElement;
}

const createGuardedFixture = (options: GuardedFixtureOptions): GuardedFixture => {
  FirstGuard.result = options.first;
  SecondGuard.result = options.second;

  const scope = new ApplicationScope();

  scope.activate(TestGuardedOwner);

  return {
    render: (children) => {
      return <RuntimeScopeProvider scope={scope}>{children}</RuntimeScopeProvider>;
    },
  };
};

abstract class FirstGuardInterface extends GuardInterface<void> {}

@Injectable()
class FirstGuard extends FirstGuardInterface {
  static result = true;

  execute(): boolean {
    return FirstGuard.result;
  }
}

abstract class SecondGuardInterface extends GuardInterface<void> {}

@Injectable()
class SecondGuard extends SecondGuardInterface {
  static result = true;

  execute(): boolean {
    return SecondGuard.result;
  }
}

class TestGuardedBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(FirstGuardInterface).to(FirstGuard).inSingletonScope();
    registry.bind(SecondGuardInterface).to(SecondGuard).inSingletonScope();
  }
}

@UseBindings(TestGuardedBindings)
class TestGuardedOwner {}
