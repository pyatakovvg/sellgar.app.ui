export type ApplicationLifecyclePhase =
  'created' | 'composing' | 'composed' | 'initializing' | 'ready' | 'failed' | 'disposing' | 'disposed';

export interface ApplicationLifecycleSnapshot {
  readonly error: unknown;
  readonly phase: ApplicationLifecyclePhase;
}

export type ApplicationLifecycleListener = () => void;

export abstract class ApplicationControllerInterface {
  abstract get lifecycle(): ApplicationLifecycleSnapshot;

  abstract subscribe(listener: ApplicationLifecycleListener): () => void;
}
