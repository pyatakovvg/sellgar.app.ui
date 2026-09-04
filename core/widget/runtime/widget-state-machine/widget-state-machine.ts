export type WidgetRuntimePhase = 'idle' | 'loading' | 'ready' | 'failed' | 'disposing' | 'disposed';

export interface WidgetStateMachineSnapshot {
  readonly error: unknown | null;
  readonly phase: WidgetRuntimePhase;
}

export class WidgetStateMachine {
  private error: unknown | null = null;
  private phase: WidgetRuntimePhase = 'idle';
  private revision = 0;

  getSnapshot(): WidgetStateMachineSnapshot {
    return this.phase === 'failed'
      ? { error: this.error, phase: this.phase }
      : WIDGET_STATE_MACHINE_SNAPSHOTS[this.phase];
  }

  isLoading(revision: number): boolean {
    return this.phase === 'loading' && this.revision === revision;
  }

  startLoading(): number {
    if (this.phase === 'disposing' || this.phase === 'disposed') {
      throw new Error('Runtime виджета уже освобождён.');
    }

    this.error = null;
    this.phase = 'loading';

    return ++this.revision;
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
    this.revision++;
  }

  toFailed(error: unknown): boolean {
    if (this.phase === 'failed' || this.phase === 'disposing' || this.phase === 'disposed') {
      return false;
    }

    this.error = error;
    this.phase = 'failed';
    this.revision++;

    return true;
  }

  completeLoading(revision: number): boolean {
    if (!this.isLoading(revision)) {
      return false;
    }

    this.error = null;
    this.phase = 'ready';

    return true;
  }

  failLoading(revision: number, error: unknown): boolean {
    if (!this.isLoading(revision)) {
      return false;
    }

    this.error = error;
    this.phase = 'failed';

    return true;
  }

  interruptLoading(revision: number): boolean {
    if (!this.isLoading(revision)) {
      return false;
    }

    this.error = null;
    this.phase = 'idle';

    return true;
  }
}

const WIDGET_STATE_MACHINE_SNAPSHOTS: Record<Exclude<WidgetRuntimePhase, 'failed'>, WidgetStateMachineSnapshot> = {
  disposed: Object.freeze({ error: null, phase: 'disposed' }),
  disposing: Object.freeze({ error: null, phase: 'disposing' }),
  idle: Object.freeze({ error: null, phase: 'idle' }),
  loading: Object.freeze({ error: null, phase: 'loading' }),
  ready: Object.freeze({ error: null, phase: 'ready' }),
};
