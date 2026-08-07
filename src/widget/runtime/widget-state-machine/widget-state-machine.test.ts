import { describe, expect, it } from 'vitest';

import { WidgetStateMachine } from './';

describe('WidgetStateMachine', () => {
  it('moves through loading and ready phases', () => {
    const stateMachine = new WidgetStateMachine();

    const sessionId = stateMachine.startLoading();

    expect(stateMachine.getSnapshot()).toEqual({
      error: null,
      phase: 'loading',
    });
    expect(stateMachine.toReady(sessionId)).toBe(true);
    expect(stateMachine.getSnapshot()).toEqual({
      error: null,
      phase: 'ready',
    });
  });

  it('ignores stale loading sessions', () => {
    const stateMachine = new WidgetStateMachine();
    const firstSessionId = stateMachine.startLoading();
    const secondSessionId = stateMachine.startLoading();

    expect(stateMachine.toReady(firstSessionId)).toBe(false);
    expect(stateMachine.toReady(secondSessionId)).toBe(true);
    expect(stateMachine.getSnapshot().phase).toBe('ready');
  });

  it('moves active loading session back to idle', () => {
    const stateMachine = new WidgetStateMachine();
    const sessionId = stateMachine.startLoading();

    expect(stateMachine.toIdle(sessionId)).toBe(true);
    expect(stateMachine.getSnapshot()).toEqual({
      error: null,
      phase: 'idle',
    });
  });

  it('moves through disposing and disposed phases', () => {
    const stateMachine = new WidgetStateMachine();

    stateMachine.toDisposing();
    stateMachine.toDisposed();

    expect(stateMachine.getSnapshot()).toEqual({
      error: null,
      phase: 'disposed',
    });
    expect(() => stateMachine.startLoading()).toThrow('Runtime виджета уже освобожден.');
  });

  it('moves to failed when React render fails and invalidates the active load session', () => {
    const stateMachine = new WidgetStateMachine();
    const sessionId = stateMachine.startLoading();
    const error = new Error('Widget render failed.');

    expect(stateMachine.toRenderFailed(error)).toBe(true);
    expect(stateMachine.getSnapshot()).toEqual({
      error,
      phase: 'failed',
    });
    expect(stateMachine.toReady(sessionId)).toBe(false);
    expect(stateMachine.toRenderFailed(error)).toBe(false);
  });
});
