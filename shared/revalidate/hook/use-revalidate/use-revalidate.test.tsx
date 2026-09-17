import React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DependencyToken } from '../../../../core/di/token/dependency-token';
import type { ModuleRuntimeRevalidateState } from '../../../../core/module/runtime/module-runtime';
import type { ControllerRuntimeContextValue } from '../../../controller/runtime/controller-runtime';
import { useRuntimeRevalidate } from './use-revalidate.hook.ts';

abstract class FirstController {}
abstract class SecondController {}

const createRuntime = () => {
  let revision = 0;
  let active: DependencyToken<unknown> | undefined;
  const listeners = new Set<() => void>();
  let pending = false;
  const revalidate = vi.fn(async () => undefined);
  const runtime: Pick<
    ControllerRuntimeContextValue,
    'subscribe' | 'getRevalidateRevision' | 'getRevalidateState' | 'revalidate'
  > = {
    revalidate,
    getRevalidateRevision: () => revision,
    getRevalidateState: (token): ModuleRuntimeRevalidateState => ({
      error: undefined,
      inProcess: pending && (token === undefined || token === active),
    }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    runtime,
    revalidate,
    publish: (token?: DependencyToken<unknown>, inProcess = true) => {
      active = token;
      pending = inProcess;
      revision++;
      listeners.forEach((listener) => listener());
    },
  };
};

describe('revalidation snapshot', () => {
  it('updates memoized consumers and preserves previous snapshots', () => {
    const source = createRuntime();
    const snapshots: ReturnType<typeof useRuntimeRevalidate>[] = [];
    const Button = React.memo(({ refresh }: { refresh: ReturnType<typeof useRuntimeRevalidate> }) => {
      snapshots.push(refresh);
      return <span>{String(refresh.inProcess)}</span>;
    });
    const Host = () => <Button refresh={useRuntimeRevalidate(source.runtime)} />;
    render(<Host />);
    act(() => source.publish(FirstController));
    expect(screen.getByText('true')).toBeDefined();
    expect(snapshots[0].inProcess).toBe(false);
    act(() => source.publish(undefined, false));
    expect(screen.getByText('false')).toBeDefined();
  });

  it('keeps general and targeted states separate and switches the target', async () => {
    const source = createRuntime();
    const hook = renderHook(
      ({ token }) => ({
        general: useRuntimeRevalidate(source.runtime),
        target: useRuntimeRevalidate(source.runtime, token),
      }),
      { initialProps: { token: FirstController } },
    );
    act(() => source.publish(SecondController));
    expect(hook.result.current.general.inProcess).toBe(true);
    expect(hook.result.current.target.inProcess).toBe(false);
    hook.rerender({ token: SecondController });
    expect(hook.result.current.target.inProcess).toBe(true);
    await hook.result.current.target();
    expect(source.revalidate).toHaveBeenCalledWith({ controllerToken: SecondController });
    act(() => source.publish());
    expect(hook.result.current.general.inProcess).toBe(true);
    expect(hook.result.current.target.inProcess).toBe(false);
  });
});
