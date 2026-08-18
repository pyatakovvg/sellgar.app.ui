import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ControllerRuntimeContextValue } from '../controller-runtime-context';
import { ControllerRuntimeProvider } from '../controller-runtime-context';

import { useParams } from './';

describe('useParams', () => {
  it('returns typed params from the nearest controller runtime and reacts to changes', () => {
    const runtime = createRuntime({ employeeId: '42' });
    const { result } = renderHook(() => useParams<EmployeeParams>(), {
      wrapper: ({ children }) => <ControllerRuntimeProvider value={runtime}>{children}</ControllerRuntimeProvider>,
    });

    expect(result.current.employeeId).toBe('42');

    act(() => runtime.setParams({ employeeId: '84' }));

    expect(result.current.employeeId).toBe('84');
  });
});

interface EmployeeParams {
  readonly employeeId: string;
}

const createRuntime = (initialParams: Record<string, string | undefined>) => {
  let params = initialParams;
  const listeners = new Set<() => void>();

  return {
    action: vi.fn(),
    getActionState: vi.fn(() => ({ data: undefined, error: undefined, inProcess: false })),
    getController: vi.fn(),
    getLoaderData: vi.fn(),
    getParams: () => params,
    getRevalidateRevision: vi.fn(() => 0),
    getRevalidateState: vi.fn(() => ({ error: undefined, inProcess: false })),
    invoke: vi.fn(),
    revalidate: vi.fn(),
    setParams: (value: Record<string, string | undefined>) => {
      params = value;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } satisfies ControllerRuntimeContextValue & {
    readonly setParams: (value: Record<string, string | undefined>) => void;
  };
};
