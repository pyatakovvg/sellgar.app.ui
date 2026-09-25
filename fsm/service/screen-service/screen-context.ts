import type { FsmToken } from '../../token/declaration/fsm-token';

export interface ScreenContext<TToken extends FsmToken> {
  readonly state: Promise<InstanceType<TToken>['state']>;
  readonly commands: InstanceType<TToken>['commands'];
}
