import { Inject, Injectable } from '../../../core/di/injection/decorators';
import { LocationServiceInterface } from '../../../core/router/service/location-service';
import { getFsmTokenMetadata, type FsmToken } from '../../token/declaration/fsm-token';
import { FsmTransportInterface } from '../../transport/contract/fsm-transport';
import type { ScreenServiceInterface } from './screen-service.interface.ts';
import type { ScreenContext } from './screen-context';
import { ScreenRouteContext } from './screen-route-context.ts';
import { CommandRuntime } from '../../command/runtime/command-runtime';
import { CommandExecutionInterface } from '../../command/runtime/command-execution';
import { materializeFsmModel } from '../../token/runtime/fsm-model';

@Injectable()
export class ScreenService implements ScreenServiceInterface {
  private readonly abort = new AbortController();
  private readonly contexts = new WeakMap<object, ScreenContext<FsmToken>>();
  private readonly commands: CommandRuntime;

  constructor(
    @Inject(LocationServiceInterface) private readonly location: LocationServiceInterface,
    @Inject(FsmTransportInterface) private readonly transport: FsmTransportInterface,
    @Inject(ScreenRouteContext) private readonly route: ScreenRouteContext,
    @Inject(CommandExecutionInterface) execution: CommandExecutionInterface,
  ) {
    this.commands = new CommandRuntime(location, transport, execution);
  }

  get<TToken extends FsmToken>(token: TToken): ScreenContext<TToken> {
    if (this.abort.signal.aborted || token !== this.route.token) {
      throw new Error('FSM token не принадлежит активному runtime маршрута.');
    }
    const snapshot = this.location.location?.state;
    assertObject(snapshot);
    const cached = this.contexts.get(snapshot);
    if (cached) return cached as ScreenContext<TToken>;

    const metadata = getFsmTokenMetadata(token);
    let state: Promise<object> | undefined;
    const loadState = () => (state ??= materializeFsmModel(metadata.state, this.transport.state(snapshot)));
    const commands = this.commands.create(metadata.commands, snapshot, loadState);

    const context = Object.freeze({
      get state() {
        return loadState();
      },
      commands: Object.freeze(commands),
    });
    this.contexts.set(snapshot, context);
    return context as ScreenContext<TToken>;
  }

  dispose(): void {
    this.abort.abort();
    this.commands.dispose();
  }
}

const assertObject: (value: unknown) => asserts value is object = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('FSM ожидает объект snapshot, state или command payload.');
  }
};
