import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ControllerRuntimeProvider,
  type ControllerRuntimeContextValue,
  type ControllerRuntimeRevalidateOptions,
} from '../../../controller/react/controller-runtime-context';

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
  readonly revalidate?: (options?: ControllerRuntimeRevalidateOptions) => Promise<void>;
}

const createUseRevalidateFixture = (options: UseRevalidateFixtureOptions = {}) => {
  const revalidate = options.revalidate ?? vi.fn(async () => {});
  const runtime: ControllerRuntimeContextValue = {
    action: vi.fn(),
    getActionState: vi.fn(() => ({ data: undefined, error: undefined, inProcess: false })),
    getController: vi.fn(() => new TestController()),
    getLoaderData: vi.fn(),
    getParams: vi.fn(() => ({})),
    getRevalidateRevision: vi.fn(() => 0),
    getRevalidateState: vi.fn(() => ({ error: undefined, inProcess: false })),
    invoke: vi.fn(),
    revalidate,
    subscribe: vi.fn(() => {
      return () => {};
    }),
  };

  return {
    revalidate,
    wrapper: ({ children }: React.PropsWithChildren) => {
      return <ControllerRuntimeProvider value={runtime}>{children}</ControllerRuntimeProvider>;
    },
  };
};

class TestController {}

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
