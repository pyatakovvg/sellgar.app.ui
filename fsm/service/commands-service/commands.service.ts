import { Inject, Injectable } from '../../../core/di/injection/decorators';
import { LocationServiceInterface } from '../../../core/router/service/location-service';
import { CommandRuntime } from '../../command/runtime/command-runtime';
import { CommandExecutionInterface } from '../../command/runtime/command-execution';
import type { FsmModelConstructor } from '../../token/declaration/fsm-token';
import { FsmTransportInterface } from '../../transport/contract/fsm-transport';
import type { CommandsServiceInterface } from './commands-service.interface';

@Injectable()
export class CommandsService implements CommandsServiceInterface {
  private readonly runtime: CommandRuntime;
  private readonly contexts = new WeakMap<object, Map<FsmModelConstructor, object>>();
  private disposed = false;

  constructor(
    @Inject(LocationServiceInterface) private readonly location: LocationServiceInterface,
    @Inject(FsmTransportInterface) transport: FsmTransportInterface,
    @Inject(CommandExecutionInterface) execution: CommandExecutionInterface,
  ) {
    this.runtime = new CommandRuntime(location, transport, execution);
  }

  get<TCommands extends object>(token: FsmModelConstructor<TCommands>): TCommands | null {
    if (this.disposed) throw new Error('CommandsService освобождён.');
    const snapshot = this.location.location?.state;
    if (snapshot === null || snapshot === undefined) return null;
    if (typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('FSM ожидает объект snapshot.');
    let context = this.contexts.get(snapshot);
    if (!context) {
      context = new Map();
      this.contexts.set(snapshot, context);
    }
    const cached = context.get(token);
    if (cached) return cached as TCommands;
    const commands = this.runtime.create(token, snapshot);
    context.set(token, commands);
    return commands;
  }

  dispose(): void {
    this.disposed = true;
    this.runtime.dispose();
  }
}
