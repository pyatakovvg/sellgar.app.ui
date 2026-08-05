export type SessionRuntimePhase = 'anonymous' | 'authenticated' | 'unknown';

export interface SessionRuntimeStateChange {
  readonly phase: SessionRuntimePhase;
  readonly previousPhase: SessionRuntimePhase;
  readonly revision: number;
}

export type SessionRuntimeStateListener = (change: SessionRuntimeStateChange) => void;

export abstract class SessionRuntimeStateInterface {
  abstract get phase(): SessionRuntimePhase;

  abstract get revision(): number;

  abstract setAnonymous(): void;

  abstract setAuthenticated(): void;

  abstract setUnknown(): void;

  abstract subscribe(listener: SessionRuntimeStateListener): () => void;
}
