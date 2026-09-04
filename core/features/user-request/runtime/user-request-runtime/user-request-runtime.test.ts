import { describe, expect, it, vi } from 'vitest';

import { DisposableRegistry } from '../../../../application/disposable/disposable-registry';

import { UserRequestRuntime } from './user-request-runtime.ts';

describe('UserRequestRuntime', () => {
  it('presents and resolves requests strictly in FIFO order', async () => {
    const runtime = new UserRequestRuntime(new DisposableRegistry());
    const firstResult = runtime.open('confirm', { title: 'Первый request' });
    const secondResult = runtime.open('confirm', { title: 'Второй request' });
    const firstRequest = runtime.getSnapshot();

    expect(firstRequest?.payload.title).toBe('Первый request');

    runtime.apply(firstRequest!.id);

    const secondRequest = runtime.getSnapshot();

    expect(await firstResult).toBe(true);
    expect(secondRequest?.payload.title).toBe('Второй request');

    runtime.cancel(secondRequest!.id);

    await expect(secondResult).resolves.toBe(false);
    expect(runtime.getSnapshot()).toBeNull();
  });

  it('preserves apply and cancel results for alert, confirm, and prompt', async () => {
    const runtime = new UserRequestRuntime(new DisposableRegistry());

    const alertResult = runtime.open('alert', { title: 'Alert' });
    runtime.apply(runtime.getSnapshot()!.id);
    await expect(alertResult).resolves.toBeUndefined();

    const confirmedResult = runtime.open('confirm', { title: 'Confirm apply' });
    runtime.apply(runtime.getSnapshot()!.id);
    await expect(confirmedResult).resolves.toBe(true);

    const cancelledConfirmResult = runtime.open('confirm', { title: 'Confirm cancel' });
    runtime.cancel(runtime.getSnapshot()!.id);
    await expect(cancelledConfirmResult).resolves.toBe(false);

    const promptResult = runtime.open('prompt', { title: 'Prompt apply' });
    runtime.apply(runtime.getSnapshot()!.id, 'typed value');
    await expect(promptResult).resolves.toBe('typed value');

    const emptyPromptResult = runtime.open('prompt', { title: 'Prompt empty apply' });
    runtime.apply(runtime.getSnapshot()!.id);
    await expect(emptyPromptResult).resolves.toBe('');

    const cancelledPromptResult = runtime.open('prompt', { title: 'Prompt cancel' });
    runtime.cancel(runtime.getSnapshot()!.id);
    await expect(cancelledPromptResult).resolves.toBeNull();
  });

  it('ignores stale and out-of-order presentation callbacks', async () => {
    const runtime = new UserRequestRuntime(new DisposableRegistry());
    const firstResult = runtime.open('confirm', { title: 'Первый request' });
    const secondResult = runtime.open('confirm', { title: 'Второй request' });
    const firstRequest = runtime.getSnapshot()!;
    const secondResultListener = vi.fn();

    void secondResult.then(secondResultListener);
    runtime.apply('unknown-request');

    expect(runtime.getSnapshot()).toBe(firstRequest);

    runtime.apply(firstRequest.id);
    runtime.cancel(firstRequest.id);
    await Promise.resolve();

    expect(await firstResult).toBe(true);
    expect(secondResultListener).not.toHaveBeenCalled();

    runtime.cancel(runtime.getSnapshot()!.id);

    await expect(secondResult).resolves.toBe(false);
  });

  it('settles pending requests with cancel results and rejects new work on application dispose', async () => {
    const disposables = new DisposableRegistry();
    const runtime = new UserRequestRuntime(disposables);
    const alertResult = runtime.open('alert', { title: 'Alert' });
    const confirmResult = runtime.open('confirm', { title: 'Confirm' });
    const promptResult = runtime.open('prompt', { title: 'Prompt' });

    await disposables.dispose();

    await expect(alertResult).resolves.toBeUndefined();
    await expect(confirmResult).resolves.toBe(false);
    await expect(promptResult).resolves.toBeNull();
    expect(runtime.getSnapshot()).toBeNull();
    expect(() => runtime.open('alert', {})).toThrow('UserRequestRuntime уже освобожден.');
  });
});
