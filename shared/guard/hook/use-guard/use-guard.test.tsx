import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Guard } from '../../../../core/guard/contract/guard';
import { ApplicationScope } from '../../../../core/runtime/scope/kind/application-scope';
import { useRuntimeGuard } from './use-guard.hook.ts';

@Guard()
class ContextGuard {
  execute(context: Promise<boolean>): Promise<boolean> {
    return context;
  }
}

describe('guard evaluation ownership', () => {
  it('does not reuse permission while a different context is pending', async () => {
    const scope = new ApplicationScope();
    const allowed = Promise.resolve(true);
    let resolve!: (value: boolean) => void;
    const pending = new Promise<boolean>((complete) => {
      resolve = complete;
    });
    const hook = renderHook(({ context }) => useRuntimeGuard(scope, ContextGuard, context), {
      initialProps: { context: allowed },
    });
    await act(async () => {
      await allowed;
    });
    expect(hook.result.current).toBe(true);
    hook.rerender({ context: pending });
    expect(hook.result.current).toBe(false);
    await act(async () => {
      resolve(false);
      await pending;
    });
    expect(hook.result.current).toBe(false);
    hook.unmount();
    scope.dispose();
  });

  it('ignores an obsolete result even when it completes after the current evaluation', async () => {
    const scope = new ApplicationScope();
    let resolve!: (value: boolean) => void;
    const pending = new Promise<boolean>((complete) => {
      resolve = complete;
    });
    const denied = Promise.resolve(false);
    const hook = renderHook(({ context }) => useRuntimeGuard(scope, ContextGuard, context), {
      initialProps: { context: pending },
    });
    hook.rerender({ context: denied });
    await act(async () => {
      await denied;
    });
    await act(async () => {
      resolve(true);
      await pending;
    });
    expect(hook.result.current).toBe(false);
    hook.unmount();
    scope.dispose();
  });
});
