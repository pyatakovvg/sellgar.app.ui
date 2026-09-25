import type { FsmToken } from '../../token/declaration/fsm-token';

export abstract class ScreenRouteContext {
  abstract readonly token: FsmToken;
}
