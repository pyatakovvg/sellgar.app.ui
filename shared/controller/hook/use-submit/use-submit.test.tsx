import React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ModuleRuntimeActionState } from '../../../../core/module/runtime/module-runtime';
import type { ControllerRuntimeContextValue } from '../../runtime/controller-runtime';
import { useRuntimeSubmit } from './use-submit.hook.ts';

abstract class FirstController {
  abstract action(input: { payload: string }): Promise<string>;
}
abstract class SecondController {
  abstract action(input: { payload: string }): Promise<string>;
}

const createRuntime = () => {
  let state: ModuleRuntimeActionState = { data: undefined, error: undefined, inProcess: false };
  const listeners = new Set<() => void>();
  const action = vi.fn(async () => 'saved');
  const runtime: Pick<ControllerRuntimeContextValue, 'subscribe' | 'getActionState' | 'action'> = {
    action,
    getActionState: <TResult,>() => state as ModuleRuntimeActionState<TResult>,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    runtime,
    action,
    publish: (next: ModuleRuntimeActionState) => {
      state = next;
      listeners.forEach((listener) => listener());
    },
    listeners,
  };
};

describe('submit snapshot', () => {
  it('updates a memoized consumer without mutating the previous handle', () => {
    const source = createRuntime();
    const snapshots: ReturnType<typeof useRuntimeSubmit<FirstController>>[] = [];
    const Button = React.memo(({ submit }: { submit: ReturnType<typeof useRuntimeSubmit<FirstController>> }) => {
      snapshots.push(submit);
      return <span>{String(submit.inProcess)}</span>;
    });
    const Host = () => <Button submit={useRuntimeSubmit(source.runtime, FirstController)} />;
    const view = render(<Host />);
    expect(screen.getByText('false')).toBeDefined();
    act(() => source.publish({ data: undefined, error: undefined, inProcess: true }));
    expect(screen.getByText('true')).toBeDefined();
    expect(snapshots[0].inProcess).toBe(false);
    expect(snapshots[1]).not.toBe(snapshots[0]);
    view.unmount();
    expect(source.listeners.size).toBe(0);
  });

  it('binds each handle to its controller and publishes completion/error', async () => {
    const source = createRuntime();
    const hook = renderHook(({ token }) => useRuntimeSubmit(source.runtime, token), {
      initialProps: { token: FirstController },
    });
    const first = hook.result.current;
    hook.rerender({ token: SecondController });
    await hook.result.current('second');
    await first('first');
    expect(source.action.mock.calls).toEqual([
      [SecondController, 'second'],
      [FirstController, 'first'],
    ]);
    const error = new Error('failed');
    act(() => source.publish({ data: 'saved', error, inProcess: false }));
    expect(hook.result.current.data).toBe('saved');
    expect(hook.result.current.error).toBe(error);
    expect(hook.result.current.inProcess).toBe(false);
    expect(first.error).toBeUndefined();
  });
});
