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
  let error: unknown;
  const revalidate = vi.fn(async () => undefined);
  const runtime: Pick<
    ControllerRuntimeContextValue,
    'subscribe' | 'getRevalidateRevision' | 'getRevalidateState' | 'revalidate'
  > = {
    revalidate,
    getRevalidateRevision: () => revision,
    getRevalidateState: (token): ModuleRuntimeRevalidateState => ({
      error: token === undefined || token === active ? error : undefined,
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
    listeners,
    revalidate,
    publish: (token?: DependencyToken<unknown>, inProcess = true, nextError?: unknown) => {
      active = token;
      pending = inProcess;
      error = nextError;
      revision++;
      listeners.forEach((listener) => listener());
    },
  };
};

describe('revalidation snapshot', () => {
  it('does not rerender unrelated controller consumers or unchanged snapshots', () => {
    const source = createRuntime();
    const firstRender = vi.fn();
    const secondRender = vi.fn();
    const generalRender = vi.fn();
    const First = () => {
      firstRender(useRuntimeRevalidate(source.runtime, FirstController));
      return null;
    };
    const Second = () => {
      secondRender(useRuntimeRevalidate(source.runtime, SecondController));
      return null;
    };
    const General = () => {
      generalRender(useRuntimeRevalidate(source.runtime));
      return null;
    };
    const view = render(
      <>
        <First />
        <Second />
        <General />
      </>,
    );
    firstRender.mockClear();
    secondRender.mockClear();
    generalRender.mockClear();

    act(() => source.publish(FirstController));
    expect(firstRender).toHaveBeenCalledTimes(1);
    expect(secondRender).not.toHaveBeenCalled();
    expect(generalRender).toHaveBeenCalledTimes(1);

    act(() => source.listeners.forEach((listener) => listener()));
    expect(firstRender).toHaveBeenCalledTimes(1);
    expect(secondRender).not.toHaveBeenCalled();
    expect(generalRender).toHaveBeenCalledTimes(1);

    act(() => source.publish(FirstController));
    expect(firstRender).toHaveBeenCalledTimes(1);
    expect(secondRender).not.toHaveBeenCalled();
    expect(generalRender).toHaveBeenCalledTimes(1);

    act(() => source.publish(FirstController, false));
    expect(firstRender).toHaveBeenCalledTimes(2);
    expect(secondRender).not.toHaveBeenCalled();
    expect(generalRender).toHaveBeenCalledTimes(2);

    act(() => source.publish());
    expect(firstRender).toHaveBeenCalledTimes(2);
    expect(secondRender).not.toHaveBeenCalled();
    expect(generalRender).toHaveBeenCalledTimes(3);
    view.unmount();
    expect(source.listeners.size).toBe(0);
  });

  it('publishes error changes without mutating previously returned handles', () => {
    const source = createRuntime();
    const hook = renderHook(() => useRuntimeRevalidate(source.runtime, FirstController));
    const initial = hook.result.current;
    const error = new Error('revalidation failed');
    act(() => source.publish(FirstController, false, error));
    const failed = hook.result.current;
    expect(failed).not.toBe(initial);
    expect(failed.error).toBe(error);
    expect(initial.error).toBeUndefined();
    act(() => source.publish(FirstController, false, error));
    expect(hook.result.current).toBe(failed);
    act(() => source.publish(FirstController, false));
    expect(hook.result.current.error).toBeUndefined();
    expect(failed.error).toBe(error);
  });

  it('resubscribes when runtime changes and reads the new target immediately', async () => {
    const first = createRuntime();
    const second = createRuntime();
    second.publish(SecondController);
    const hook = renderHook(({ runtime, token }) => useRuntimeRevalidate(runtime, token), {
      initialProps: { runtime: first.runtime, token: FirstController },
    });
    hook.rerender({ runtime: second.runtime, token: SecondController });
    expect(first.listeners.size).toBe(0);
    expect(second.listeners.size).toBe(1);
    expect(hook.result.current.inProcess).toBe(true);
    await hook.result.current();
    expect(second.revalidate).toHaveBeenCalledWith({ controllerToken: SecondController });
    hook.rerender({ runtime: second.runtime, token: FirstController });
    expect(hook.result.current.inProcess).toBe(false);
    expect(second.listeners.size).toBe(1);
    hook.unmount();
    expect(second.listeners.size).toBe(0);
  });

  it('aggregates target errors without exposing general errors to keyed consumers', () => {
    const source = createRuntime();
    const hook = renderHook(() => ({
      general: useRuntimeRevalidate(source.runtime),
      first: useRuntimeRevalidate(source.runtime, FirstController),
      second: useRuntimeRevalidate(source.runtime, SecondController),
    }));
    const targetError = new Error('target failure');
    act(() => source.publish(FirstController, false, targetError));
    const failedTarget = hook.result.current.first;
    expect(hook.result.current.general.error).toBe(targetError);
    expect(failedTarget.error).toBe(targetError);
    expect(hook.result.current.second.error).toBeUndefined();

    act(() => source.publish());
    expect(hook.result.current.general.inProcess).toBe(true);
    expect(hook.result.current.first.inProcess).toBe(false);
    expect(hook.result.current.second.inProcess).toBe(false);
    const generalError = new Error('general failure');
    act(() => source.publish(undefined, false, generalError));
    expect(hook.result.current.general.error).toBe(generalError);
    expect(hook.result.current.first.error).toBeUndefined();
    expect(hook.result.current.second.error).toBeUndefined();
    expect(failedTarget.error).toBe(targetError);

    act(() => source.publish(undefined, false));
    expect(hook.result.current.general.error).toBeUndefined();
    hook.unmount();
    expect(source.listeners.size).toBe(0);
  });

  it('keeps repeated non-reflexive error values stable', () => {
    const source = createRuntime();
    const rendered = vi.fn();
    const Probe = () => {
      rendered(useRuntimeRevalidate(source.runtime, FirstController));
      return null;
    };
    const view = render(<Probe />);
    rendered.mockClear();

    act(() => source.publish(FirstController, false, Number.NaN));
    expect(rendered).toHaveBeenCalledTimes(1);
    const failed = rendered.mock.lastCall![0];
    expect(failed.error).toBeNaN();
    act(() => source.publish(FirstController, false, Number.NaN));
    expect(rendered).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(source.listeners.size).toBe(0);
  });

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
