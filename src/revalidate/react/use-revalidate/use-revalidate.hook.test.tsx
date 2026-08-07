import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ControllerRuntimeProvider } from '../../../controller/react/controller-runtime-context';
import type { DependencyToken } from '../../../di/token/dependency-token';
import type { ModuleRuntime } from '../../../module/runtime/module-runtime';

import { useRevalidate } from './';

describe('useRevalidate', () => {
  it('exposes idle state by default', () => {
    const { wrapper } = createUseRevalidateFixture();

    const { result } = renderHook(() => useRevalidate(), {
      wrapper,
    });

    expect(result.current.error).toBeUndefined();
    expect(result.current.inProcess).toBe(false);
  });

  it('calls nearest runtime revalidate with optional controller token', async () => {
    const { revalidate, wrapper } = createUseRevalidateFixture();

    const { result } = renderHook(() => useRevalidate(TestController), {
      wrapper,
    });

    await act(async () => {
      await result.current();
    });

    expect(revalidate).toHaveBeenCalledWith({
      controllerToken: TestController,
      signal: expect.any(AbortSignal),
    });
  });

  it('exposes local in-process state while revalidation is pending', async () => {
    const deferred = createDeferred<void>();
    const { wrapper } = createUseRevalidateFixture({
      revalidate: vi.fn(() => deferred.promise),
    });

    const { result } = renderHook(() => useRevalidate(), {
      wrapper,
    });

    void act(() => {
      void result.current();
    });

    await waitFor(() => {
      expect(result.current.inProcess).toBe(true);
    });

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    expect(result.current.inProcess).toBe(false);
  });
});

interface UseRevalidateFixtureOptions {
  readonly revalidate?: ModuleRuntime['revalidate'];
}

const createUseRevalidateFixture = (options: UseRevalidateFixtureOptions = {}) => {
  const revalidate = options.revalidate ?? vi.fn(async () => {});
  const runtime = {
    revalidate,
    subscribe: vi.fn(() => {
      return () => {};
    }),
  } as unknown as ModuleRuntime;

  return {
    revalidate,
    wrapper: ({ children }: React.PropsWithChildren) => {
      return (
        <ControllerRuntimeProvider
          value={{
            controllers: createControllerRegistry(TestController, new TestController()),
            kind: 'module',
            runtime,
          }}
        >
          {children}
        </ControllerRuntimeProvider>
      );
    },
  };
};

class TestController {}

const createControllerRegistry = <TController,>(
  token: DependencyToken<TController>,
  controller: TController,
): ReadonlyMap<DependencyToken<unknown>, unknown> => {
  const controllers = new Map<DependencyToken<unknown>, unknown>();

  controllers.set(token, controller);

  return controllers;
};

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  readonly reject: (error: unknown) => void;
  readonly resolve: (value: TValue) => void;
}

const createDeferred = <TValue,>(): Deferred<TValue> => {
  let resolve: Deferred<TValue>['resolve'] | null = null;
  let reject: Deferred<TValue>['reject'] | null = null;
  const promise = new Promise<TValue>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    reject: (error) => {
      reject?.(error);
    },
    resolve: (value) => {
      resolve?.(value);
    },
  };
};
