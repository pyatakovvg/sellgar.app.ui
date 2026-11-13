import { describe, expect, it, vi } from 'vitest';

import { DisposableRegistry } from './disposable-registry.ts';

describe('DisposableRegistry cleanup', () => {
  it.each(['sync', 'async'] as const)('contains a %s failure and runs every cleanup in reverse order', async (kind) => {
    const registry = new DisposableRegistry();
    const error = new Error('cleanup failed');
    const order: string[] = [];
    const onError = vi.fn();

    registry.add(() => {
      order.push('first');
    });
    registry.add({
      dispose: () => {
        order.push('failed');
        if (kind === 'sync') throw error;
        return Promise.reject(error);
      },
    });
    registry.add(() => {
      order.push('last');
    });

    await expect(registry.dispose(onError)).resolves.toBeUndefined();
    expect(order).toEqual(['last', 'failed', 'first']);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);

    await registry.dispose(onError);
    expect(order).toEqual(['last', 'failed', 'first']);
    expect(onError).toHaveBeenCalledOnce();
  });
});
