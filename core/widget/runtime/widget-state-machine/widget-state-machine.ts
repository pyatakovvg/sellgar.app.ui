import type { RuntimeException } from '../../../runtime/exception/runtime-exception';

export type WidgetRuntimePhase = 'idle' | 'loading' | 'ready' | 'failed' | 'disposing' | 'disposed';

export interface WidgetStateMachineSnapshot {
  readonly exception: RuntimeException | null;
  readonly phase: WidgetRuntimePhase;
}

export class WidgetStateMachine {
  private exception: RuntimeException | null = null;
  private phase: WidgetRuntimePhase = 'idle';
  private revision = 0;

  getSnapshot(): WidgetStateMachineSnapshot {
    return this.phase === 'failed'
      ? { exception: this.exception, phase: this.phase }
      : WIDGET_STATE_MACHINE_SNAPSHOTS[this.phase];
  }

  isLoading(revision: number): boolean {
    return this.phase === 'loading' && this.revision === revision;
  }

  startLoading(): number {
    if (this.phase === 'disposing' || this.phase === 'disposed') {
      throw new Error('Runtime виджета уже освобождён.');
    }

    this.exception = null;
    this.phase = 'loading';

    return ++this.revision;
  }

  toDisposed(): void {
    if (this.phase !== 'disposing') {
      throw new Error('Runtime виджета должен перейти в disposing перед disposed.');
    }

    this.exception = null;
    this.phase = 'disposed';
  }

  toDisposing(): void {
    if (this.phase === 'disposed') {
      return;
    }

    this.exception = null;
    this.phase = 'disposing';
    this.revision++;
  }

  toFailed(exception: RuntimeException): boolean {
    if (this.phase === 'failed' || this.phase === 'disposing' || this.phase === 'disposed') {
      return false;
    }

    this.exception = exception;
    this.phase = 'failed';
    this.revision++;

    return true;
  }

  completeLoading(revision: number): boolean {
    if (!this.isLoading(revision)) {
      return false;
    }

    this.exception = null;
    this.phase = 'ready';

    return true;
  }

  failLoading(revision: number, exception: RuntimeException): boolean {
    if (!this.isLoading(revision)) {
      return false;
    }

    this.exception = exception;
    this.phase = 'failed';

    return true;
  }

  interruptLoading(revision: number): boolean {
    if (!this.isLoading(revision)) {
      return false;
    }

    this.exception = null;
    this.phase = 'idle';

    return true;
  }
}

const WIDGET_STATE_MACHINE_SNAPSHOTS: Record<Exclude<WidgetRuntimePhase, 'failed'>, WidgetStateMachineSnapshot> = {
  disposed: Object.freeze({ exception: null, phase: 'disposed' }),
  disposing: Object.freeze({ exception: null, phase: 'disposing' }),
  idle: Object.freeze({ exception: null, phase: 'idle' }),
  loading: Object.freeze({ exception: null, phase: 'loading' }),
  ready: Object.freeze({ exception: null, phase: 'ready' }),
};
