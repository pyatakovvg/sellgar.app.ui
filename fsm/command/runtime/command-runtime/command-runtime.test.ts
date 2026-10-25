import { Expose } from 'class-transformer';
import { Matches } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import type { LocationServiceInterface } from '../../../../core/router/service/location-service';
import { Command, type CommandHandler } from '../../../token/declaration/fsm-token';
import { Payload } from '../../../token/declaration/payload';
import { CommandExecution } from '../command-execution';
import { CommandRuntime } from './command-runtime';

class PhonePayload {
  @Expose()
  @Matches(/^\+7[0-9]{10}$/)
  readonly phone: string;
}

class PhoneCommand {
  @Payload(PhonePayload)
  readonly payload: PhonePayload;
}

class NoPayloadCommand {}

class Commands {
  @Command(PhoneCommand)
  readonly phone: CommandHandler<PhoneCommand>;

  @Command(NoPayloadCommand)
  readonly noPayload: CommandHandler<NoPayloadCommand>;
}

const fixture = () => {
  const snapshot = {};
  let current: object = snapshot;
  const descriptor = { arbitraryServerMetadata: true };
  const execution = new CommandExecution();
  const location: LocationServiceInterface = {
    get location() {
      return { params: {}, state: current };
    },
    paramsToObject: vi.fn(),
    subscribe: vi.fn(),
  };
  const transport = {
    state: vi.fn(),
    resolve: vi.fn<() => object | null>(() => descriptor),
    send: vi.fn(async () => {
      execution.confirm({});
    }),
  };
  const runtime = new CommandRuntime(location, transport, execution);
  const commands = runtime.create(Commands, snapshot);
  return {
    runtime,
    execution,
    commands,
    transport,
    descriptor,
    snapshot,
    replace: () => {
      current = {};
    },
  };
};

describe('FSM command descriptor and payload runtime', () => {
  it('sends the resolved descriptor and the validated payload model separately', async () => {
    const { commands, transport, descriptor, snapshot } = fixture();
    await commands.phone({ phone: '+77001234567' });
    expect(transport.send).toHaveBeenCalledWith(
      snapshot,
      descriptor,
      expect.any(PhonePayload),
      expect.any(AbortSignal),
      expect.any(String),
    );
  });

  it('does not materialize a no-payload command from an empty argument', async () => {
    const { commands, transport, descriptor, snapshot } = fixture();
    await commands.noPayload();
    expect(transport.send).toHaveBeenCalledWith(
      snapshot,
      descriptor,
      undefined,
      expect.any(AbortSignal),
      expect.any(String),
    );
    await expect(Reflect.apply(commands.noPayload, undefined, [{}])).rejects.toThrow('не принимает payload');
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { phone: 42 }, { phone: 'invalid' }, { phone: '+77001234567', extra: true }])(
    'rejects invalid outgoing data before send: %j',
    async (input) => {
      const { commands, transport } = fixture();
      await expect(Reflect.apply(commands.phone, undefined, [input])).rejects.toBeDefined();
      expect(transport.send).not.toHaveBeenCalled();
    },
  );

  it('requires payload when a model is declared', async () => {
    const { commands, transport } = fixture();
    await expect(Reflect.apply(commands.phone, undefined, [])).rejects.toThrow('объект');
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('rechecks availability after asynchronous payload preparation', async () => {
    const { commands, transport } = fixture();
    const promise = commands.phone({ phone: '+77001234567' });
    transport.resolve.mockReturnValue(null);
    await expect(promise).rejects.toThrow('изменился');
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('preserves stale snapshot and disposal protection', async () => {
    const { commands, transport, runtime, replace } = fixture();
    replace();
    expect(commands.phone.available).toBe(false);
    await expect(commands.phone({ phone: '+77001234567' })).rejects.toThrow('недоступна');
    runtime.dispose();
    expect(commands.noPayload.available).toBe(false);
    expect(transport.send).not.toHaveBeenCalled();
  });
});
