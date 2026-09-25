import { Expose } from 'class-transformer';
import { IsString } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import type { LocationServiceInterface } from '../../../core/router/service/location-service';
import { State, Commands, Command, type CommandHandler } from '../../token/declaration/fsm-token';
import type { FsmTransportInterface } from '../../transport/contract/fsm-transport';
import { ScreenService } from './screen.service';
import { CommandExecution } from '../../command/runtime/command-execution';

class TestState {
  @Expose()
  @IsString()
  readonly title: string;
}

class CompleteCommand {}

class TestCommands {
  @Command(CompleteCommand)
  readonly complete: CommandHandler<CompleteCommand>;
}

class TestRoute {
  @State(TestState)
  readonly state: TestState;

  @Commands(TestCommands)
  readonly commands: TestCommands;
}

const createFixture = () => {
  let snapshot = { title: 'first' };
  const location: LocationServiceInterface = {
    get location() {
      return { params: {}, state: snapshot };
    },
    paramsToObject: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  };
  const transport = {
    state: vi.fn((value: unknown) => value),
    available: vi.fn(() => true),
    send: vi.fn(async () => {
      execution.confirm({});
    }),
  } satisfies FsmTransportInterface;
  const execution = new CommandExecution();
  return {
    service: new ScreenService(location, transport, { token: TestRoute }, execution),
    transport,
    replace: () => {
      snapshot = { title: 'next' };
    },
  };
};

describe('ScreenService', () => {
  it('provides typed loader state and token-owned commands', async () => {
    const { service, transport } = createFixture();
    const context = service.get(TestRoute);
    expect(service.get(TestRoute)).toBe(context);
    expect(await context.state).toBeInstanceOf(TestState);
    expect(await context.state).toEqual({ title: 'first' });
    expect(context.commands.complete.available).toBe(true);
    await context.commands.complete();
    expect(transport.send).toHaveBeenCalledWith(
      { title: 'first' },
      CompleteCommand,
      expect.any(CompleteCommand),
      expect.any(AbortSignal),
      expect.any(String),
    );
  });

  it('rejects another route token', () => {
    class OtherRoute extends TestRoute {}
    const { service } = createFixture();
    expect(() => service.get(OtherRoute)).toThrow('не принадлежит');
  });

  it('invalidates old commands when the snapshot changes', async () => {
    const { service, replace, transport } = createFixture();
    const previous = service.get(TestRoute);
    replace();
    expect(previous.commands.complete.available).toBe(false);
    await expect(previous.commands.complete()).rejects.toThrow('недоступна');
    expect(transport.send).not.toHaveBeenCalled();
    expect(await service.get(TestRoute).state).toEqual({ title: 'next' });
  });

  it('coalesces repeated execution of the same command', async () => {
    const { service, transport } = createFixture();
    const commands = service.get(TestRoute).commands;
    const first = commands.complete();
    expect(commands.complete()).toBe(first);
    await first;
    expect(transport.send).toHaveBeenCalledOnce();
  });

  it('disables the context and commands after route disposal', async () => {
    const { service, transport } = createFixture();
    const context = service.get(TestRoute);
    service.dispose();
    expect(context.commands.complete.available).toBe(false);
    expect(() => service.get(TestRoute)).toThrow('не принадлежит');
    await expect(context.commands.complete()).rejects.toThrow('недоступна');
    expect(transport.send).not.toHaveBeenCalled();
  });
});
