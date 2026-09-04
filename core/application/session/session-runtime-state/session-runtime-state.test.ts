import { describe, expect, it, vi } from 'vitest';

import { SessionRuntimeState } from './session-runtime-state.ts';

describe('SessionRuntimeState', () => {
  it('starts with unknown phase', () => {
    const session = new SessionRuntimeState();

    expect(session.phase).toBe('unknown');
    expect(session.revision).toBe(0);
  });

  it('transitions between known session phases', () => {
    const session = new SessionRuntimeState();

    session.setAnonymous();
    expect(session.phase).toBe('anonymous');
    expect(session.revision).toBe(1);

    session.setAuthenticated();
    expect(session.phase).toBe('authenticated');
    expect(session.revision).toBe(2);

    session.setUnknown();
    expect(session.phase).toBe('unknown');
    expect(session.revision).toBe(3);
  });

  it('notifies subscribers only when phase changes', () => {
    const session = new SessionRuntimeState();
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);

    session.setUnknown();
    session.setAnonymous();
    session.setAnonymous();
    session.setAuthenticated();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, {
      cause: 'state-change',
      phase: 'anonymous',
      previousPhase: 'unknown',
      revision: 1,
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      cause: 'state-change',
      phase: 'authenticated',
      previousPhase: 'anonymous',
      revision: 2,
    });

    unsubscribe();
    session.setUnknown();

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('distinguishes controlled transitions from session expiration', () => {
    const session = new SessionRuntimeState();
    const interruptionListener = vi.fn();
    const stateListener = vi.fn();
    const unsubscribe = session.subscribeInterruption(interruptionListener);
    session.subscribe(stateListener);

    session.setAuthenticated();
    session.setAnonymous();

    expect(interruptionListener).not.toHaveBeenCalled();

    session.setAuthenticated();
    session.expire();

    expect(session.phase).toBe('anonymous');
    expect(interruptionListener).toHaveBeenCalledOnce();
    expect(stateListener).toHaveBeenLastCalledWith({
      cause: 'expiration',
      phase: 'anonymous',
      previousPhase: 'authenticated',
      revision: 4,
    });

    unsubscribe();
    session.setAuthenticated();
    session.expire();

    expect(interruptionListener).toHaveBeenCalledOnce();
  });
});
