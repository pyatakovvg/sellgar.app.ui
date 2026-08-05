import type { ApplicationControllerInterface } from '../../application/lifecycle/application-lifecycle';
import type { SessionRuntimeStateInterface } from '../../application/session/session-runtime-state';

export interface RuntimeContextInterface {
  readonly app: ApplicationControllerInterface;
  readonly session: SessionRuntimeStateInterface;
  readonly signal: AbortSignal;
}
