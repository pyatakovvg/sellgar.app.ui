import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Guard } from '../../../../core/guard/contract/guard';
import { ApplicationScope } from '../../../../core/runtime/scope/kind/application-scope';
import { useRuntimeGuard } from './use-guard.hook.ts';

@Guard()
class ContextGuard {
  execute(context: Promise<boolean>): Promise<boolean> {
    return context;
  }
}

@Guard()
class InlineContextGuard {
  execute(context: { readonly allowed: boolean }): boolean {
    return context.allowed;
  }
}

describe('guard evaluation ownership', () => {
  it('settles when the context is declared inline', async () => {
    const scope = new ApplicationScope();
    const execute = vi.spyOn(InlineContextGuard.prototype, 'execute');
    const hook = renderHook(() => {
      return useRuntimeGuard(scope, InlineContextGuard, { allowed: true });
    });

    await waitFor(() => expect(hook.result.current).toBe(true));
    await act(async () => Promise.resolve());

    expect(execute).toHaveBeenCalledTimes(2);

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
