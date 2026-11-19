import type { RuntimeException } from '../../../runtime/exception/runtime-exception';
import type { LocationServiceListener, RouterLocationSnapshot } from '../../../router/service/location-service';

export type ApplicationLifecyclePhase =
  'created' | 'composing' | 'composed' | 'initializing' | 'ready' | 'failed' | 'disposing' | 'disposed';

export interface ApplicationLifecycleSnapshot {
  readonly exception: RuntimeException | null;
  readonly phase: ApplicationLifecyclePhase;
}

export type ApplicationLifecycleListener = () => void;

export abstract class ApplicationControllerInterface {
  abstract get lifecycle(): ApplicationLifecycleSnapshot;

  abstract subscribe(listener: ApplicationLifecycleListener): () => void;

  abstract get location(): RouterLocationSnapshot | null;

  abstract subscribeLocation(listener: LocationServiceListener): () => void;
}
