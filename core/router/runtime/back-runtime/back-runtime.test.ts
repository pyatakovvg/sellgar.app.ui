import { describe, expect, it, vi } from 'vitest';

import { createBackBoundary } from './back-boundary.ts';
import { BackRuntime } from './back-runtime.ts';

describe('BackRuntime', () => {
  it('does not invoke a disabled interception', async () => {
    const runtime = new BackRuntime();
    const boundary = createBackBoundary();
    const handler = vi.fn();

    runtime.register(boundary, () => false, handler);

    await expect(runtime.handle([boundary])).resolves.toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('invokes the first enabled interception from the deepest boundary', async () => {
    const runtime = new BackRuntime();
    const parent = createBackBoundary();
    const child = createBackBoundary();
    const parentHandler = vi.fn();
    const childHandler = vi.fn();

    runtime.register(parent, () => true, parentHandler);
    runtime.register(child, () => true, childHandler);

    await expect(runtime.handle([child, parent])).resolves.toBe(true);
    expect(childHandler).toHaveBeenCalledOnce();
    expect(parentHandler).not.toHaveBeenCalled();
  });

  it('uses the latest enabled interception within one boundary', async () => {
    const runtime = new BackRuntime();
    const boundary = createBackBoundary();
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    runtime.register(boundary, () => true, firstHandler);
    runtime.register(boundary, () => true, secondHandler);

    await expect(runtime.handle([boundary])).resolves.toBe(true);
    expect(secondHandler).toHaveBeenCalledOnce();
    expect(firstHandler).not.toHaveBeenCalled();
  });

  it('consumes repeated Back intents while an asynchronous handler is running', async () => {
    const runtime = new BackRuntime();
    const boundary = createBackBoundary();
    let complete: (() => void) | undefined;
    const handler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );

    runtime.register(boundary, () => true, handler);

    const first = runtime.handle([boundary]);

    await expect(runtime.handle([boundary])).resolves.toBe(true);
    expect(handler).toHaveBeenCalledOnce();

    complete?.();
    await expect(first).resolves.toBe(true);
  });

  it('removes a disposed interception', async () => {
    const runtime = new BackRuntime();
    const boundary = createBackBoundary();
    const handler = vi.fn();
    const interception = runtime.register(boundary, () => true, handler);

    interception.dispose();

    await expect(runtime.handle([boundary])).resolves.toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
