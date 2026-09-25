import type { FsmModelConstructor } from '../../token/declaration/fsm-token';

export abstract class CommandsServiceInterface {
  abstract get<TCommands extends object>(token: FsmModelConstructor<TCommands>): TCommands | null;
  abstract dispose(): void;
}
