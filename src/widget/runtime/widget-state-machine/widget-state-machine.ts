export type WidgetRuntimePhase = 'idle' | 'loading' | 'ready' | 'failed' | 'disposing' | 'disposed';

export interface WidgetStateMachineSnapshot {
  readonly error: unknown | null;
  readonly phase: WidgetRuntimePhase;
}

export class WidgetStateMachine {
  private error: unknown | null = null;
  private phase: WidgetRuntimePhase = 'idle';
  private sessionCounter = 0;

  getSnapshot(): WidgetStateMachineSnapshot {
    return {
      error: this.error,
      phase: this.phase,
    };
  }

  isLoadingSession(sessionId: number): boolean {
    return this.phase === 'loading' && this.sessionCounter === sessionId;
  }

  startLoading(): number {
    if (this.phase === 'disposing' || this.phase === 'disposed') {
      throw new Error('Runtime виджета уже освобожден.');
    }

    this.error = null;
    this.phase = 'loading';

    return ++this.sessionCounter;
  }

  toDisposed(): void {
    if (this.phase !== 'disposing') {
      throw new Error('Runtime виджета должен перейти в disposing перед disposed.');
    }

    this.error = null;
    this.phase = 'disposed';
  }

  toDisposing(): void {
    if (this.phase === 'disposed') {
      return;
    }

    this.error = null;
    this.phase = 'disposing';
    this.sessionCounter++;
  }

  toFailed(sessionId: number, error: unknown): boolean {
    if (!this.isLoadingSession(sessionId)) {
      return false;
    }

    this.error = error;
    this.phase = 'failed';

    return true;
  }

  toRenderFailed(error: unknown): boolean {
    if (this.phase === 'failed' || this.phase === 'disposing' || this.phase === 'disposed') {
      return false;
    }

    this.error = error;
    this.phase = 'failed';
    this.sessionCounter++;

    return true;
  }

  toIdle(sessionId: number): boolean {
    if (!this.isLoadingSession(sessionId)) {
      return false;
    }

    this.error = null;
    this.phase = 'idle';

    return true;
  }

  toReady(sessionId: number): boolean {
    if (!this.isLoadingSession(sessionId)) {
      return false;
    }

    this.error = null;
    this.phase = 'ready';

    return true;
  }
}
