import type { LocationServiceInterface } from '../../../../core/router/service/location-service';
import { getFsmCommands, type FsmModelConstructor } from '../../../token/declaration/fsm-token';
import { materializeFsmModel } from '../../../token/runtime/fsm-model';
import type { FsmTransportInterface } from '../../../transport/contract/fsm-transport';
import type { CommandExecutionInterface } from '../command-execution';

export class CommandRuntime {
  private readonly abort = new AbortController();

  constructor(
    private readonly location: LocationServiceInterface,
    private readonly transport: FsmTransportInterface,
    private readonly execution: CommandExecutionInterface,
  ) {}

  create<TCommands extends object>(
    token: FsmModelConstructor<TCommands>,
    snapshot: object,
    prepare?: () => Promise<unknown>,
  ): TCommands {
    const commands = new token();
    for (const [name, command] of getFsmCommands(token)) {
      const available = () =>
        !this.abort.signal.aborted &&
        this.location.location?.state === snapshot &&
        this.transport.available(snapshot, command);
      const execute = (payload: object = {}): Promise<void> => {
        if (!available()) return Promise.reject(new Error('FSM команда недоступна в текущем snapshot.'));
        return this.execution.run(snapshot, command, async (signal, commandId) => {
          await prepare?.();
          const validated = await materializeFsmModel(command, payload);
          if (!available()) throw new Error('FSM snapshot изменился до отправки команды.');
          signal.throwIfAborted();
          await this.transport.send(snapshot, command, validated, signal, commandId);
        });
      };
      Object.defineProperty(execute, 'available', { get: available });
      Object.defineProperty(commands, name, { value: Object.freeze(execute), enumerable: true });
    }
    return Object.freeze(commands);
  }

  dispose(): void {
    this.abort.abort();
  }
}
