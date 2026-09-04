import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { DependencyToken } from '../../../../core/di/token/dependency-token';
import type { ModuleRuntimeRevalidateState } from '../../../../core/module/runtime/module-runtime';
import {
  ControllerRuntimeProvider,
  type ControllerRuntimeContextValue,
} from '../../../controller/runtime/controller-runtime-context';
import { useRevalidate } from './use-revalidate.hook.ts';

abstract class TestController {}

describe('useRevalidate', () => {
  it('exposes core revalidation state without creating renderer-owned processing state', async () => {
    const listeners = new Set<() => void>();
    const states = new Map<DependencyToken<unknown> | undefined, ModuleRuntimeRevalidateState>();
    const revalidate = vi.fn(async () => undefined);
    let revision = 0;
    const runtime = {
      getRevalidateRevision: () => revision,
      getRevalidateState: (token?: DependencyToken<unknown>) =>
        states.get(token) ?? { error: undefined, inProcess: false },
      revalidate,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as ControllerRuntimeContextValue;
    const wrapper: React.FC<React.PropsWithChildren> = ({ children }) => (
      <ControllerRuntimeProvider value={runtime}>{children}</ControllerRuntimeProvider>
    );
    const { result } = renderHook(() => useRevalidate(TestController), { wrapper });

    expect(result.current.inProcess).toBe(false);

    act(() => {
      states.set(TestController, { error: undefined, inProcess: true });
      revision += 1;
      listeners.forEach((listener) => listener());
    });

    expect(result.current.inProcess).toBe(true);

    await act(() => result.current());

    expect(revalidate).toHaveBeenCalledWith({ controllerToken: TestController });
  });
});
