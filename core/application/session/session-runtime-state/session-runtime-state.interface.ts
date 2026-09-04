export type SessionRuntimePhase = 'anonymous' | 'authenticated' | 'unknown';
export type SessionRuntimeStateChangeCause = 'expiration' | 'state-change';

export interface SessionRuntimeStateChange {
  readonly cause: SessionRuntimeStateChangeCause;
  readonly phase: SessionRuntimePhase;
  readonly previousPhase: SessionRuntimePhase;
  readonly revision: number;
}

export type SessionRuntimeStateListener = (change: SessionRuntimeStateChange) => void;
export type SessionRuntimeInterruptionListener = () => void;

export abstract class SessionRuntimeStateInterface {
  abstract get phase(): SessionRuntimePhase;

  abstract get revision(): number;

  abstract expire(): void;

  abstract setAnonymous(): void;

  abstract setAuthenticated(): void;

  abstract setUnknown(): void;

  abstract subscribe(listener: SessionRuntimeStateListener): () => void;

  abstract subscribeInterruption(listener: SessionRuntimeInterruptionListener): () => void;
}
