import { describe, expect, it, vi } from 'vitest';

import { SessionRuntimeState } from './';

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
      phase: 'anonymous',
      previousPhase: 'unknown',
      revision: 1,
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      phase: 'authenticated',
      previousPhase: 'anonymous',
      revision: 2,
    });

    unsubscribe();
    session.setUnknown();

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
