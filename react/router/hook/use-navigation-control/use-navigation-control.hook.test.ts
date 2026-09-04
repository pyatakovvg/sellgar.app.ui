import { afterEach, describe, expect, it, vi } from 'vitest';

import { executeNavigationControl } from './use-navigation-control.hook.ts';

describe('executeNavigationControl', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'startViewTransition');
  });

  it('executes navigation directly when a view transition was not requested', async () => {
    const execute = vi.fn(async () => undefined);
    const startViewTransition = vi.fn();

    Object.assign(document, { startViewTransition });

    await executeNavigationControl(execute, false);

    expect(execute).toHaveBeenCalledOnce();
    expect(startViewTransition).not.toHaveBeenCalled();
  });

  it('runs the same navigation operation inside the browser view transition', async () => {
    const execute = vi.fn(async () => undefined);
    const startViewTransition = vi.fn((callback: () => Promise<void>) => ({
      updateCallbackDone: callback(),
    }));

    Object.assign(document, { startViewTransition });

    await executeNavigationControl(execute, true);

    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
  });

  it('falls back to ordinary navigation when the browser capability is unavailable', async () => {
    const execute = vi.fn(async () => undefined);

    await executeNavigationControl(execute, true);

    expect(execute).toHaveBeenCalledOnce();
  });
});
