import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DependencyToken } from '../../../di/token/dependency-token';
import { RuntimeScopeInterface } from '../../../runtime/scope/contract';
import { RuntimeScopeProvider } from '../../../runtime/react';

import { RevalidateServiceInterface } from '../../contract/revalidate-service';
import type { RevalidateHandler, RevalidateKey } from '../../contract/revalidate-service';

import { RevalidateBridge } from './revalidate-bridge.tsx';

const useRevalidatorMock = vi.hoisted(() => {
  return vi.fn<() => TestRevalidator>();
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();

  return {
    ...actual,
    useRevalidator: useRevalidatorMock,
  };
});

describe('RevalidateBridge', () => {
  afterEach(() => {
    useRevalidatorMock.mockReset();
  });

  it('registers and unregisters fallback handler', async () => {
    const fixture = createFixture();

    useRevalidatorMock.mockReturnValue(fixture.revalidator);

    const { unmount } = render(
      fixture.render(
        <RevalidateBridge fallback>
          <div>Content</div>
        </RevalidateBridge>,
      ),
    );

    await waitFor(() => {
      expect(fixture.service.registerFallback).toHaveBeenCalledTimes(1);
    });

    const handler = getFirstCallArg(fixture.service.registerFallback);

    unmount();

    expect(fixture.service.unregisterFallback).toHaveBeenCalledWith(handler);
  });

  it('registers and unregisters controller handlers', async () => {
    const firstController = Symbol('first-controller');
    const secondController = Symbol('second-controller');
    const controllers = [firstController, secondController];
    const fixture = createFixture();

    useRevalidatorMock.mockReturnValue(fixture.revalidator);

    const { unmount } = render(
      fixture.render(
        <RevalidateBridge controllerTokens={controllers}>
          <div>Content</div>
        </RevalidateBridge>,
      ),
    );

    await waitFor(() => {
      expect(fixture.service.register).toHaveBeenCalledTimes(2);
    });

    const firstHandler = fixture.service.register.mock.calls[0]?.[1];
    const secondHandler = fixture.service.register.mock.calls[1]?.[1];

    expect(fixture.service.register).toHaveBeenNthCalledWith(1, firstController, firstHandler);
    expect(fixture.service.register).toHaveBeenNthCalledWith(2, secondController, secondHandler);

    unmount();

    expect(fixture.service.unregister).toHaveBeenNthCalledWith(1, firstController, firstHandler);
    expect(fixture.service.unregister).toHaveBeenNthCalledWith(2, secondController, secondHandler);
  });

  it('resolves pending revalidate when revalidator becomes idle', async () => {
    const fixture = createFixture();
    const revalidate = vi.fn();
    let revalidator = createRevalidator('loading', revalidate);

    useRevalidatorMock.mockImplementation(() => revalidator);

    const { rerender } = render(fixture.render(<RevalidateBridge fallback />));

    await waitFor(() => {
      expect(fixture.service.registerFallback).toHaveBeenCalledTimes(1);
    });

    const handler = getFirstCallArg(fixture.service.registerFallback);
    const revalidatePromise = Promise.resolve(handler());
    const resolved = vi.fn();

    void revalidatePromise.then(resolved);
    await waitFor(() => {
      expect(revalidate).toHaveBeenCalledTimes(1);
    });

    expect(resolved).not.toHaveBeenCalled();

    revalidator = createRevalidator('idle', revalidate);
    rerender(fixture.render(<RevalidateBridge fallback />));

    await expect(revalidatePromise).resolves.toBeUndefined();
    expect(resolved).toHaveBeenCalledTimes(1);
  });

  it('resolves pending revalidate on bridge unmount', async () => {
    const fixture = createFixture();

    useRevalidatorMock.mockReturnValue(createRevalidator('loading'));

    const { unmount } = render(fixture.render(<RevalidateBridge fallback />));

    await waitFor(() => {
      expect(fixture.service.registerFallback).toHaveBeenCalledTimes(1);
    });

    const handler = getFirstCallArg(fixture.service.registerFallback);
    const revalidatePromise = Promise.resolve(handler());

    unmount();

    await expect(revalidatePromise).resolves.toBeUndefined();
  });

  it('resolves pending revalidate when revalidator rejects', async () => {
    const fixture = createFixture();
    const revalidate = vi.fn(() => {
      return Promise.reject(new Error('Revalidate был отклонен.'));
    });

    useRevalidatorMock.mockReturnValue(createRevalidator('loading', revalidate));

    render(fixture.render(<RevalidateBridge fallback />));

    await waitFor(() => {
      expect(fixture.service.registerFallback).toHaveBeenCalledTimes(1);
    });

    const handler = getFirstCallArg(fixture.service.registerFallback);

    await expect(handler()).resolves.toBeUndefined();
  });
});

interface Fixture {
  readonly render: (children: React.ReactNode) => React.ReactElement;
  readonly revalidator: TestRevalidator;
  readonly scope: TestRuntimeScope;
  readonly service: TestRevalidateService;
}

const createFixture = (): Fixture => {
  const service = new TestRevalidateService();
  const scope = new TestRuntimeScope(service);
  const revalidator = createRevalidator('idle');

  return {
    render: (children) => {
      return <RuntimeScopeProvider scope={scope}>{children}</RuntimeScopeProvider>;
    },
    revalidator,
    scope,
    service,
  };
};

const createRevalidator = (
  state: TestRevalidator['state'],
  revalidate: TestRevalidator['revalidate'] = vi.fn(),
): TestRevalidator => {
  return {
    revalidate,
    state,
  };
};

interface TestRevalidator {
  readonly revalidate: () => void | Promise<void>;
  readonly state: 'idle' | 'loading';
}

class TestRuntimeScope extends RuntimeScopeInterface {
  constructor(private readonly revalidateService: RevalidateServiceInterface) {
    super();
  }

  activate(): void {}

  dispose(): void {}

  get<TValue>(token: DependencyToken<TValue>): TValue {
    if (token === RevalidateServiceInterface) {
      return this.revalidateService as TValue;
    }

    throw new Error('Неожиданный dependency token.');
  }
}

class TestRevalidateService extends RevalidateServiceInterface {
  readonly register = vi.fn((_key: RevalidateKey, _handler: RevalidateHandler) => {});
  readonly registerFallback = vi.fn((_handler: RevalidateHandler) => {});
  readonly revalidate = vi.fn(async () => {});
  readonly unregister = vi.fn((_key: RevalidateKey, _handler: RevalidateHandler) => {});
  readonly unregisterFallback = vi.fn((_handler: RevalidateHandler) => {});
}

interface RevalidateHandlerMock {
  readonly mock: {
    readonly calls: readonly (readonly unknown[])[];
  };
}

const getFirstCallArg = (mock: RevalidateHandlerMock): RevalidateHandler => {
  const handler = mock.mock.calls[0]?.[0];

  if (typeof handler !== 'function') {
    throw new Error('Handler revalidate не был зарегистрирован.');
  }

  return handler as RevalidateHandler;
};
