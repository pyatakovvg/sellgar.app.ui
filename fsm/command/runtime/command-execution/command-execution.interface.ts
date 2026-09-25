import type { FsmModelConstructor } from '../../../token/declaration/fsm-token';

export abstract class CommandExecutionInterface {
  abstract run(
    snapshot: object,
    command: FsmModelConstructor,
    send: (signal: AbortSignal, commandId: string) => Promise<void>,
  ): Promise<void>;

  abstract confirm(snapshot: unknown): void;

  abstract dispose(): void;
}
