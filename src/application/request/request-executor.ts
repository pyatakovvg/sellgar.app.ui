import { Inject, Injectable, Optional } from '../../di/injection/decorators';
import { isHttpException, type HttpException } from '../../http';
import { captureRuntimeFailure, reportRuntimeFailure, RuntimeFailureReporterInterface } from '../../runtime/failure';
import { createRuntimeInterruption } from '../../runtime/operation';
import { SessionExpirationNotifierInterface } from '../session/session-expiration-notifier';
import { SessionRuntimeStateInterface } from '../session/session-runtime-state';

export type RequestMode = 'parallel' | 'sequential';

export interface RequestExecutionContext {
  readonly signal: AbortSignal;
}

export interface RequestExecutionOptions {
  readonly cancelPrevious?: boolean;
  readonly mode?: RequestMode;
  readonly priority?: number;
  readonly queueKey?: string;
  readonly scope?: string;
}

export type RequestOperation<T> = (context: RequestExecutionContext) => Promise<T>;

export abstract class RequestExecutorInterface {
  abstract run<T>(operation: RequestOperation<T>): Promise<T>;
  abstract run<T>(options: RequestExecutionOptions, operation: RequestOperation<T>): Promise<T>;
  abstract cancelScope(scope: string): void;
  abstract cancelAll(): void;
}

interface NormalizedRequestExecutionOptions {
  readonly cancelPrevious: boolean;
  readonly mode: RequestMode;
  readonly priority: number;
  readonly queueKey: string | null;
  readonly scope: string | null;
}

interface ExecutionTask<T = unknown> {
  readonly controller: AbortController;
  readonly id: number;
  readonly operation: RequestOperation<T>;
  readonly options: NormalizedRequestExecutionOptions;
  readonly sessionBound: boolean;
  readonly signal: AbortSignal;
  sessionTerminated: boolean;
  reject(error: unknown): void;
  resolve(value: T): void;
}

type RequestErrorResolution =
  { readonly error: unknown; readonly type: 'reject' } | { readonly type: 'session-contained' };

const DEFAULT_MODE: RequestMode = 'parallel';

@Injectable()
export class RequestExecutor extends RequestExecutorInterface {
  private readonly activeSequentialKeys = new Set<string>();
  private readonly activeTasks = new Set<ExecutionTask>();
  private readonly pendingTasks: ExecutionTask[] = [];
  private nextTaskId = 0;
  private recoveryAbortController: AbortController | null = null;
  private sessionRecoveryActive = false;
  private recoveryPromise: Promise<void> | null = null;

  constructor(
    @Inject(SessionRuntimeStateInterface)
    private readonly session: SessionRuntimeStateInterface,
    @Inject(SessionExpirationNotifierInterface)
    @Optional()
    private readonly expirationNotifier?: SessionExpirationNotifierInterface,
    @Inject(RuntimeFailureReporterInterface)
    @Optional()
    private readonly reporter?: RuntimeFailureReporterInterface,
  ) {
    super();
  }

  run<T>(operation: RequestOperation<T>): Promise<T>;
  run<T>(options: RequestExecutionOptions, operation: RequestOperation<T>): Promise<T>;
  run<T>(
    optionsOrOperation: RequestExecutionOptions | RequestOperation<T>,
    maybeOperation?: RequestOperation<T>,
  ): Promise<T> {
    const options =
      typeof optionsOrOperation === 'function' ? this.normalizeOptions() : this.normalizeOptions(optionsOrOperation);
    const operation = typeof optionsOrOperation === 'function' ? optionsOrOperation : maybeOperation;

    if (!operation) {
      throw new Error('Операция запроса обязательна.');
    }

    if (options.cancelPrevious && options.scope) {
      this.cancelScope(options.scope);
    }

    return this.enqueue(options, operation);
  }

  cancelScope(scope: string): void {
    this.cancelPendingTasks((task) => task.options.scope === scope);

    for (const task of this.activeTasks) {
      if (task.options.scope === scope) {
        task.controller.abort();
      }
    }
  }

  cancelAll(): void {
    this.cancelPendingTasks(() => true);

    for (const task of this.activeTasks) {
      task.controller.abort();
    }

    this.recoveryAbortController?.abort();
  }

  private normalizeOptions(options: RequestExecutionOptions = {}): NormalizedRequestExecutionOptions {
    const mode = options.mode ?? DEFAULT_MODE;
    const scope = options.scope ?? null;
    const queueKey = options.queueKey ?? scope;

    if (mode === 'sequential' && !queueKey) {
      throw new Error('Для последовательного запроса нужен queueKey или scope.');
    }

    return {
      cancelPrevious: options.cancelPrevious ?? false,
      mode,
      priority: options.priority ?? 0,
      queueKey,
      scope,
    };
  }

  private enqueue<T>(options: NormalizedRequestExecutionOptions, operation: RequestOperation<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const controller = new AbortController();
      const task: ExecutionTask<T> = {
        controller,
        id: ++this.nextTaskId,
        operation,
        options,
        reject,
        resolve,
        sessionBound: this.session.phase !== 'anonymous',
        signal: controller.signal,
        sessionTerminated: false,
      };

      if (task.sessionBound && this.sessionRecoveryActive) {
        task.sessionTerminated = true;
        task.controller.abort();
        return;
      }

      this.pendingTasks.push(task as ExecutionTask);
      this.pendingTasks.sort((left, right) => right.options.priority - left.options.priority || left.id - right.id);
      this.drain();
    });
  }

  private drain(): void {
    while (this.pendingTasks.length > 0) {
      const taskIndex = this.pendingTasks.findIndex(
        (task) =>
          task.options.mode !== 'sequential' ||
          !task.options.queueKey ||
          !this.activeSequentialKeys.has(task.options.queueKey),
      );

      if (taskIndex < 0) {
        return;
      }

      const [task] = this.pendingTasks.splice(taskIndex, 1);

      if (!task) {
        return;
      }

      this.start(task);
    }
  }

  private start(task: ExecutionTask): void {
    if (task.signal.aborted) {
      task.reject(createRuntimeInterruption(undefined, 'request-cancelled'));
      return;
    }

    this.activeTasks.add(task);

    if (task.options.mode === 'sequential' && task.options.queueKey) {
      this.activeSequentialKeys.add(task.options.queueKey);
    }

    void this.execute(task);
  }

  private async execute<T>(task: ExecutionTask<T>): Promise<void> {
    try {
      const value = await task.operation({ signal: task.signal });

      if (task.sessionTerminated) {
        return;
      }

      if (task.signal.aborted) {
        task.reject(createRuntimeInterruption(undefined, 'request-cancelled'));
        return;
      }

      task.resolve(value);
    } catch (error) {
      if (task.sessionTerminated) {
        return;
      }

      const resolvedError = await this.resolveError(error, task);

      if (resolvedError.type === 'reject' && !task.sessionTerminated) {
        task.reject(resolvedError.error);
      }
    } finally {
      const wasActive = this.activeTasks.delete(task);

      if (wasActive && task.options.mode === 'sequential' && task.options.queueKey) {
        this.activeSequentialKeys.delete(task.options.queueKey);
      }

      if (wasActive) {
        this.drain();
      }
    }
  }

  private async resolveError(error: unknown, task: ExecutionTask): Promise<RequestErrorResolution> {
    if (task.signal.aborted) {
      return { error: createRuntimeInterruption(error, 'request-cancelled'), type: 'reject' };
    }

    if (!isHttpException(error) || error.status !== 401) {
      return { error, type: 'reject' };
    }

    if (!task.sessionBound) {
      return { error, type: 'reject' };
    }

    if (this.session.phase !== 'anonymous') {
      await this.recoverSession(error);
    } else {
      this.terminateSessionTasks();
    }

    return { type: 'session-contained' };
  }

  private recoverSession(error: HttpException): Promise<void> {
    if (!this.recoveryPromise) {
      const controller = new AbortController();

      this.recoveryAbortController = controller;
      this.sessionRecoveryActive = true;
      this.recoveryPromise = this.executeSessionRecovery(error, controller.signal).finally(() => {
        if (this.recoveryAbortController === controller) {
          this.recoveryAbortController = null;
        }

        this.sessionRecoveryActive = false;
        this.recoveryPromise = null;
      });
    }

    return this.recoveryPromise;
  }

  private async executeSessionRecovery(error: HttpException, signal: AbortSignal): Promise<void> {
    this.terminateSessionTasks();

    try {
      if (this.session.phase === 'authenticated') {
        await this.expirationNotifier?.notify({ error, signal });
      }
    } catch (cause) {
      if (this.reporter) {
        const owner = { kind: 'application' } as const;
        const failure = captureRuntimeFailure(cause, {
          operation: 'notify-session-expiration',
          owner,
          participant: { kind: 'session-expiration-notifier' },
        });

        await reportRuntimeFailure(this.reporter, failure, owner, 'session-recovery.contained', this.session.phase);
      }
    } finally {
      this.terminateSessionTasks();
      this.session.setAnonymous();
    }
  }

  private terminateSessionTasks(): void {
    // A protected-session 401 belongs to application state. These promises stay
    // unsettled so the controller call stack cannot observe it; the session
    // revision guard completes the owning runtime operation instead.
    for (let index = this.pendingTasks.length - 1; index >= 0; index--) {
      const task = this.pendingTasks[index];

      if (!task?.sessionBound) {
        continue;
      }

      this.pendingTasks.splice(index, 1);
      task.sessionTerminated = true;
      task.controller.abort();
    }

    for (const task of this.activeTasks) {
      if (!task.sessionBound) {
        continue;
      }

      task.sessionTerminated = true;
      task.controller.abort();
      this.activeTasks.delete(task);

      if (task.options.mode === 'sequential' && task.options.queueKey) {
        this.activeSequentialKeys.delete(task.options.queueKey);
      }
    }

    this.drain();
  }

  private cancelPendingTasks(predicate: (task: ExecutionTask) => boolean): void {
    for (let index = this.pendingTasks.length - 1; index >= 0; index--) {
      const task = this.pendingTasks[index];

      if (!task || !predicate(task)) {
        continue;
      }

      this.pendingTasks.splice(index, 1);
      task.reject(createRuntimeInterruption(undefined, 'request-cancelled'));
    }
  }
}
