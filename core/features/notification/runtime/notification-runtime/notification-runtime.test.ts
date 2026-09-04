import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DisposableRegistry } from '../../../../application/disposable/disposable-registry';
import { NotificationRuntime } from './notification-runtime.ts';

describe('NotificationRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves queue order and applies the semantic defaults', () => {
    const runtime = new NotificationRuntime(new DisposableRegistry());
    const first = runtime.show({ title: 'Первое уведомление' });
    const second = runtime.show({ status: 'success', title: 'Второе уведомление' });

    expect(runtime.getSnapshot()).toEqual([
      expect.objectContaining({
        id: first.id,
        status: 'info',
        title: 'Первое уведомление',
      }),
      expect.objectContaining({
        id: second.id,
        status: 'success',
        title: 'Второе уведомление',
      }),
    ]);

    first.close();

    expect(runtime.getSnapshot().map((notification) => notification.id)).toEqual([second.id]);
  });

  it('keeps auto-close disabled by default and uses 5000 ms when enabled', () => {
    const runtime = new NotificationRuntime(new DisposableRegistry());
    const manual = runtime.show({ title: 'Без таймера' });
    const automatic = runtime.show({ autoClose: true, title: 'С таймером' });

    vi.advanceTimersByTime(4999);

    expect(runtime.getSnapshot().map((notification) => notification.id)).toEqual([manual.id, automatic.id]);

    vi.advanceTimersByTime(1);

    expect(runtime.getSnapshot().map((notification) => notification.id)).toEqual([manual.id]);
  });

  it('pauses and resumes the remaining auto-close timeout', () => {
    const runtime = new NotificationRuntime(new DisposableRegistry());
    const notification = runtime.show({ autoClose: true, timeoutMs: 100, title: 'Пауза' });

    vi.advanceTimersByTime(40);
    runtime.pauseAutoClose(notification.id);
    vi.advanceTimersByTime(1000);

    expect(runtime.getSnapshot()).toHaveLength(1);

    runtime.resumeAutoClose(notification.id);
    vi.advanceTimersByTime(59);

    expect(runtime.getSnapshot()).toHaveLength(1);

    vi.advanceTimersByTime(1);

    expect(runtime.getSnapshot()).toHaveLength(0);
  });

  it('cancels timers and clears the queue with the application disposables', async () => {
    const disposables = new DisposableRegistry();
    const runtime = new NotificationRuntime(disposables);
    const listener = vi.fn();

    runtime.subscribe(listener);
    runtime.show({ autoClose: true, title: 'Будет освобождено' });

    await disposables.dispose();
    vi.advanceTimersByTime(5000);

    expect(runtime.getSnapshot()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
