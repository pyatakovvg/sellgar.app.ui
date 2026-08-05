import {
  SessionRuntimeStateInterface,
  type SessionRuntimePhase,
  type SessionRuntimeStateChange,
  type SessionRuntimeStateListener,
} from './session-runtime-state.interface.ts';

export class SessionRuntimeState extends SessionRuntimeStateInterface {
  private listeners = new Set<SessionRuntimeStateListener>();
  private currentRevision = 0;
  private value: SessionRuntimePhase = 'unknown';

  get phase(): SessionRuntimePhase {
    return this.value;
  }

  get revision(): number {
    return this.currentRevision;
  }

  setAnonymous(): void {
    this.setPhase('anonymous');
  }

  setAuthenticated(): void {
    this.setPhase('authenticated');
  }

  setUnknown(): void {
    this.setPhase('unknown');
  }

  subscribe(listener: SessionRuntimeStateListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private setPhase(phase: SessionRuntimePhase): void {
    if (this.value === phase) {
      return;
    }

    const previousPhase = this.value;

    this.value = phase;
    this.currentRevision += 1;
    this.emit({
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
}
