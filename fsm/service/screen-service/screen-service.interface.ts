import type { FsmToken } from '../../token/declaration/fsm-token';

import type { ScreenContext } from './screen-context';

export abstract class ScreenServiceInterface {
  abstract get<TToken extends FsmToken>(token: TToken): ScreenContext<TToken>;
  abstract dispose(): void;
}
