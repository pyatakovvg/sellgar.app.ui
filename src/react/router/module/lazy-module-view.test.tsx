import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ControllerRuntimeContextValue } from '../../../controller/react/controller-runtime-context';
import type { ModuleRuntime, ModuleRuntimeSnapshot } from '../../../module/runtime/module-runtime';
import { RenderExceptionBoundary } from '../exception/render-exception-boundary.tsx';

import { LazyModuleView } from './lazy-module-view.tsx';

describe('LazyModuleView', () => {
  it('передаёт явную module exception ближайшему React boundary', () => {
    const error = new Error('Критическая ошибка модуля.');
    const runtime = createModuleRuntime();
    const onError = vi.fn();

    render(
      <RenderExceptionBoundary exception={<div>Ошибка модуля</div>} onError={onError}>
        <LazyModuleView moduleRuntime={runtime.value} routeRuntime={{} as ControllerRuntimeContextValue} />
      </RenderExceptionBoundary>,
    );

    act(() => runtime.fail(error));

    expect(screen.getByText('Ошибка модуля')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(error);
  });
});

const createModuleRuntime = () => {
  const listeners = new Set<() => void>();
  let snapshot: ModuleRuntimeSnapshot = {
    error: null,
    phase: 'active',
  };

  const value = {
    getSnapshot: () => snapshot,
    getViewModuleOrNull: () => null,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as ModuleRuntime;

  return {
    fail: (error: unknown) => {
      snapshot = {
        error,
        phase: 'failed',
      };
      listeners.forEach((listener) => listener());
    },
    value,
  };
};
