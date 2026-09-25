export type FsmModelConstructor<TValue extends object = object> = new () => TValue;

export interface FsmTokenContract {
  readonly state: object;
  readonly commands: object;
}

export type FsmToken = FsmModelConstructor<FsmTokenContract>;

export type CommandHandler<TPayload extends object> = (keyof TPayload extends never
  ? () => Promise<void>
  : (payload: TPayload) => Promise<void>) & { readonly available: boolean };

interface FsmTokenMetadata {
  readonly state: FsmModelConstructor;
  readonly commands: FsmModelConstructor;
}

const STATE = Symbol('fsm:state');
const COMMANDS = Symbol('fsm:commands');
const COMMAND = Symbol('fsm:command');

export const State = (model: FsmModelConstructor): PropertyDecorator => (target, property) => {
  if (property !== 'state') throw new Error('@State должен описывать поле state.');
  Reflect.defineMetadata(STATE, model, target.constructor);
};

export const Commands = (model: FsmModelConstructor): PropertyDecorator => (target, property) => {
  if (property !== 'commands') throw new Error('@Commands должен описывать поле commands.');
  Reflect.defineMetadata(COMMANDS, model, target.constructor);
};

export const Command = (model: FsmModelConstructor): PropertyDecorator => (target, property) => {
  const metadata = new Map<string | symbol, FsmModelConstructor>(Reflect.getMetadata(COMMAND, target.constructor));
  metadata.set(property, model);
  Reflect.defineMetadata(COMMAND, metadata, target.constructor);
};

export const getFsmTokenMetadata = (token: FsmToken): FsmTokenMetadata => {
  const state = Reflect.getMetadata(STATE, token) as FsmModelConstructor | undefined;
  const commands = Reflect.getMetadata(COMMANDS, token) as FsmModelConstructor | undefined;
  if (!state || !commands) throw new Error('FSM route token должен объявлять @State и @Commands.');
  return { state, commands };
};

export const isFsmToken = (token: unknown): token is FsmToken =>
  typeof token === 'function' && Reflect.hasMetadata(STATE, token) && Reflect.hasMetadata(COMMANDS, token);

export const getFsmCommands = (model: FsmModelConstructor): ReadonlyMap<string | symbol, FsmModelConstructor> =>
  new Map(Reflect.getMetadata(COMMAND, model));
