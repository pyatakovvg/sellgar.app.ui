import type { FsmModelConstructor } from '../../../token/declaration/fsm-token';

export abstract class FsmTransportInterface {
  abstract state(snapshot: unknown): unknown;
  abstract resolve(snapshot: unknown, command: FsmModelConstructor): object | null;
  abstract send(
    snapshot: unknown,
    descriptor: object,
    payload: object | undefined,
    signal: AbortSignal,
    commandId: string,
  ): Promise<void>;
}
