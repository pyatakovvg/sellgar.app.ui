import { describe, expect, it, vi } from 'vitest';

import { createNavigationBlockerBoundary } from './navigation-blocker-boundary.ts';
import { NavigationBlockerRuntime } from './navigation-blocker-runtime.ts';

describe('NavigationBlockerRuntime', () => {
  it('asks only registrations of leaving boundaries and keeps nested priority', async () => {
    const runtime = new NavigationBlockerRuntime();
    const parent = createNavigationBlockerBoundary();
    const nested = createNavigationBlockerBoundary();
    const retained = createNavigationBlockerBoundary();
    const parentRegistration = runtime.register(parent, () => true);
    const firstNestedRegistration = runtime.register(nested, () => true);
    const lastNestedRegistration = runtime.register(nested, () => true);

    runtime.register(retained, () => true);

    const confirmation = runtime.confirm([nested, parent], new AbortController().signal);

    expect(runtime.getSnapshot()?.registrationIdentities).toEqual([
      lastNestedRegistration.identity,
      firstNestedRegistration.identity,
      parentRegistration.identity,
    ]);

    runtime.stay();

    await expect(confirmation).resolves.toBe(false);
    expect(runtime.getSnapshot()).toBeNull();
  });

  it('allows one transition of its boundary without bypassing another boundary', async () => {
    const runtime = new NavigationBlockerRuntime();
    const parent = createNavigationBlockerBoundary();
    const nested = createNavigationBlockerBoundary();

    runtime.register(parent, () => true);
    runtime.register(nested, () => true);

    await runtime.allow(nested, async () => {
      const confirmation = runtime.confirm([nested, parent], new AbortController().signal);

      expect(runtime.getSnapshot()?.registrationIdentities).toHaveLength(1);
      runtime.stay();
      await expect(confirmation).resolves.toBe(false);
    });

    const nextConfirmation = runtime.confirm([nested], new AbortController().signal);

    expect(runtime.getSnapshot()?.registrationIdentities).toHaveLength(1);
    runtime.stay();
    await expect(nextConfirmation).resolves.toBe(false);
  });

  it('hides the decision after leave while retaining its acceptance until transition completion', async () => {
    const runtime = new NavigationBlockerRuntime();
    const boundary = createNavigationBlockerBoundary();

    runtime.register(boundary, () => true);
    const confirmation = runtime.confirm([boundary], new AbortController().signal);

    runtime.leave();

    await expect(confirmation).resolves.toBe(true);
    expect(runtime.getSnapshot()).toBeNull();
    expect(runtime.hasAcceptedDecision()).toBe(true);

    await expect(runtime.confirm([boundary], new AbortController().signal)).resolves.toBe(false);
    runtime.complete();

    expect(runtime.getSnapshot()).toBeNull();
    expect(runtime.hasAcceptedDecision()).toBe(false);
  });

  it('cancels a pending decision when its navigation signal is aborted', async () => {
    const runtime = new NavigationBlockerRuntime();
    const boundary = createNavigationBlockerBoundary();
    const abortController = new AbortController();

    runtime.register(boundary, () => true);
    const confirmation = runtime.confirm([boundary], abortController.signal);

    abortController.abort();

    await expect(confirmation).resolves.toBe(false);
    expect(runtime.getSnapshot()).toBeNull();
  });

  it('combines conditions and removes disposed registrations', async () => {
    const runtime = new NavigationBlockerRuntime();
    const boundary = createNavigationBlockerBoundary();
    const falseCondition = vi.fn(() => false);
    const activeRegistration = runtime.register(boundary, () => true);

    runtime.register(boundary, falseCondition);

    expect(runtime.shouldBlockUnload()).toBe(true);
    const confirmation = runtime.confirm([boundary], new AbortController().signal);

    runtime.stay();
    await expect(confirmation).resolves.toBe(false);
    expect(falseCondition).toHaveBeenCalled();

    activeRegistration.dispose();

    await expect(runtime.confirm([boundary], new AbortController().signal)).resolves.toBe(true);
    expect(runtime.shouldBlockUnload()).toBe(false);
  });
});
