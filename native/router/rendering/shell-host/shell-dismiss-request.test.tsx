import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useShellDismissRequest } from './shell-dismiss-request.ts';

describe('useShellDismissRequest', () => {
  it('starts dismiss once even when the host rerenders with another callback identity', () => {
    const firstDismiss = vi.fn();
    const secondDismiss = vi.fn();
    const hook = renderHook(({ dismiss }) => useShellDismissRequest(dismiss), {
      initialProps: { dismiss: firstDismiss },
    });

    act(() => hook.result.current());
    hook.rerender({ dismiss: secondDismiss });
    act(() => hook.result.current());

    expect(firstDismiss).toHaveBeenCalledOnce();
    expect(secondDismiss).not.toHaveBeenCalled();
  });
});
