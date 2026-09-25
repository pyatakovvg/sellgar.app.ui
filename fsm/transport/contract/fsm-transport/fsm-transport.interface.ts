import type { FsmModelConstructor } from '../../../token/declaration/fsm-token';

export abstract class FsmTransportInterface {
  abstract state(snapshot: unknown): unknown;
  abstract available(snapshot: unknown, command: FsmModelConstructor): boolean;
  abstract send(
    snapshot: unknown,
    command: FsmModelConstructor,
    payload: object,
    signal: AbortSignal,
    commandId: string,
  ): Promise<void>;
}
