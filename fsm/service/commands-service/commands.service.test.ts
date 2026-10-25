import { Expose } from 'class-transformer';
import { IsString } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import type { LocationServiceInterface } from '../../../core/router/service/location-service';
import { Command, type CommandHandler } from '../../token/declaration/fsm-token';
import { Payload } from '../../token/declaration/payload';
import { CommandsService } from './commands.service';
import { CommandExecution } from '../../command/runtime/command-execution';

class ChangePayload {
  @Expose()
  @IsString()
  readonly language: string;
}

class Change {
  @Payload(ChangePayload)
  readonly payload: ChangePayload;
}

class Commands {
  @Command(Change)
  readonly change: CommandHandler<Change>;
}

const fixture = () => {
  let snapshot: object | null = null;
  const location: LocationServiceInterface = {
    get location() {
      return { params: {}, state: snapshot };
    },
    paramsToObject: vi.fn(),
    subscribe: vi.fn(),
  };
  const transport = {
    state: vi.fn(),
    resolve: vi.fn<() => object | null>(() => ({})),
    send: vi.fn(async () => {
      execution.confirm({});
    }),
  };
  const execution = new CommandExecution();
  return {
    service: new CommandsService(location, transport, execution),
    execution,
    transport,
    publish: () => {
      snapshot = {};
    },
  };
};

describe('application CommandsService', () => {
  it('uses a command token without screen state and validates payloads', async () => {
    const { service, publish, transport } = fixture();
    expect(service.get(Commands)).toBeNull();
    publish();
    const commands = service.get(Commands);
    expect(commands).not.toBeNull();
    expect(service.get(Commands)).toBe(commands);
    await commands?.change({ language: 'kz' });
    expect(transport.state).not.toHaveBeenCalled();
    expect(transport.send).toHaveBeenCalledWith(
      {},
      {},
      expect.any(ChangePayload),
      expect.any(AbortSignal),
      expect.any(String),
    );
    if (!commands) throw new Error('Expected commands');
    await expect(Reflect.apply(commands.change, undefined, [{ language: 5 }])).rejects.toBeInstanceOf(Array);
    expect(transport.send).toHaveBeenCalledTimes(1);
    service.dispose();
  });

  it('rejects unavailable, stale and disposed commands', async () => {
    const { service, publish, transport } = fixture();
    publish();
    const commands = service.get(Commands);
    transport.resolve.mockReturnValue(null);
    expect(commands?.change.available).toBe(false);
    await expect(commands?.change({ language: 'kz' })).rejects.toThrow('недоступна');
    transport.resolve.mockReturnValue({});
    publish();
    await expect(commands?.change({ language: 'kz' })).rejects.toThrow('недоступна');
    const current = service.get(Commands);
    service.dispose();
    await expect(current?.change({ language: 'kz' })).rejects.toThrow('недоступна');
    expect(() => service.get(Commands)).toThrow('освобождён');
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('rechecks snapshot identity after async validation', async () => {
    const { service, publish, transport } = fixture();
    publish();
    const operation = service.get(Commands)?.change({ language: 'kz' });
    publish();
    await expect(operation).rejects.toThrow('изменился');
    expect(transport.send).not.toHaveBeenCalled();
    service.dispose();
  });

  it('coalesces repeated commands and aborts an in-flight request at application disposal', async () => {
    const { service, publish, transport, execution } = fixture();
    transport.send.mockImplementation(async (...args: unknown[]) => {
      const signal = args[3];
      if (!(signal instanceof AbortSignal)) throw new Error('Missing signal');
      await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    });
    publish();
    const commands = service.get(Commands);
    const operation = commands?.change({ language: 'kz' });
    expect(commands?.change({ language: 'kz' })).toBe(operation);
    const rejected = expect(operation).rejects.toBeDefined();
    await vi.waitFor(() => expect(transport.send).toHaveBeenCalledOnce());
    service.dispose();
    execution.dispose();
    await rejected;
  });
});
