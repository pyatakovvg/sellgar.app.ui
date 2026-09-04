import {
  SessionRuntimeStateInterface,
  type SessionRuntimePhase,
  type SessionRuntimeInterruptionListener,
  type SessionRuntimeStateChange,
  type SessionRuntimeStateListener,
} from './session-runtime-state.interface.ts';

export class SessionRuntimeState implements SessionRuntimeStateInterface {
  private interruptionListeners = new Set<SessionRuntimeInterruptionListener>();
  private listeners = new Set<SessionRuntimeStateListener>();
  private currentRevision = 0;
  private value: SessionRuntimePhase = 'unknown';

  get phase(): SessionRuntimePhase {
    return this.value;
  }

  get revision(): number {
    return this.currentRevision;
  }

  expire(): void {
    if (this.value === 'anonymous') {
      this.emitInterruption();
      return;
    }

    this.setPhase('anonymous', 'expiration', true);
  }

  setAnonymous(): void {
    this.setPhase('anonymous', 'state-change');
  }

  setAuthenticated(): void {
    this.setPhase('authenticated', 'state-change');
  }

  setUnknown(): void {
    this.setPhase('unknown', 'state-change');
  }

  subscribe(listener: SessionRuntimeStateListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeInterruption(listener: SessionRuntimeInterruptionListener): () => void {
    this.interruptionListeners.add(listener);

    return () => {
      this.interruptionListeners.delete(listener);
    };
  }

  private setPhase(phase: SessionRuntimePhase, cause: SessionRuntimeStateChange['cause'], interrupt = false): void {
    if (this.value === phase) {
      return;
    }

    const previousPhase = this.value;

    this.value = phase;
    this.currentRevision += 1;

    if (interrupt) {
      this.emitInterruption();
    }

    this.emit({
      cause,
      phase,
      previousPhase,
      revision: this.currentRevision,
    });
  }

  private emit(change: SessionRuntimeStateChange): void {
    for (const listener of this.listeners) {
      listener(change);
    }
  }

  private emitInterruption(): void {
    for (const listener of this.interruptionListeners) {
      listener();
    }
  }
}
