import { Injectable } from '../../../../core/di/injection/decorators';

import type { FsmModelConstructor } from '../../../token/declaration/fsm-token';
import type { CommandExecutionInterface } from './command-execution.interface.ts';

const CONFIRMATION_TIMEOUT_MS = 30_000;

interface PendingCommand {
  readonly id: string;
  readonly snapshot: object;
  readonly command: FsmModelConstructor;
  readonly promise: Promise<void>;
  readonly abort: AbortController;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

@Injectable()
export class CommandExecution implements CommandExecutionInterface {
  private pending: PendingCommand | null = null;
  private readonly requests = new Set<AbortController>();
  private disposed = false;

  run(
    snapshot: object,
    command: FsmModelConstructor,
    send: (signal: AbortSignal, commandId: string) => Promise<void>,
  ): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new Error('FSM выполнение команд освобождено.'));
    }

    if (this.pending) {
      if (this.pending.snapshot === snapshot && this.pending.command === command) {
        return this.pending.promise;
      }

      return Promise.reject(new Error('Предыдущая FSM команда ещё ожидает snapshot.'));
    }

    const completion = Promise.withResolvers<void>();
    const operation: PendingCommand = {
      id: crypto.randomUUID(),
      snapshot,
      command,
      promise: completion.promise,
      abort: new AbortController(),
      resolve: completion.resolve,
      reject: completion.reject,
      timeout: setTimeout(() => {
        this.fail(operation, new Error('Не получен подтверждающий snapshot команды.'));
      }, CONFIRMATION_TIMEOUT_MS),
    };

    this.pending = operation;

    // Install the waiter before sending: the snapshot can arrive before the HTTP response.
    void Promise.resolve()
      .then(() => {
        if (this.pending === operation) {
          this.requests.add(operation.abort);
          return send(operation.abort.signal, operation.id);
        }
      })
      .catch((error: unknown) => this.fail(operation, error))
      .finally(() => this.requests.delete(operation.abort));

    return operation.promise;
  }

  confirm(snapshot: unknown): void {
    const operation = this.pending;

    if (!operation || snapshot === operation.snapshot) {
      return;
    }

    this.pending = null;
    clearTimeout(operation.timeout);
    operation.resolve();
  }

  dispose(): void {
    this.disposed = true;

    if (this.pending) {
      this.fail(this.pending, new Error('FSM приложение освобождено до подтверждения команды.'));
    }

    for (const request of this.requests) {
      request.abort();
    }

    this.requests.clear();
  }

  private fail(operation: PendingCommand, error: unknown): void {
    if (this.pending !== operation) {
      return;
    }

    this.pending = null;
    clearTimeout(operation.timeout);
    operation.abort.abort(error);
    operation.reject(error);
  }
}
