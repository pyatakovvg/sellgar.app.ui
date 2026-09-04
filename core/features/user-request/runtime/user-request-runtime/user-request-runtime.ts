import { DisposableRegistryInterface } from '../../../../application/disposable/disposable-registry';
import { Inject, Injectable } from '../../../../di/injection/decorators';
import type {
  UserRequestAlertPayload,
  UserRequestBasePayload,
  UserRequestConfirmPayload,
  UserRequestPromptPayload,
} from '../../contract/user-request-service';

import type {
  UserRequestAlertRequest,
  UserRequestConfirmRequest,
  UserRequestKind,
  UserRequestPromptRequest,
  UserRequestRequest,
} from './user-request-request.ts';
import { UserRequestRuntimeInterface, type UserRequestRuntimeListener } from './user-request-runtime.interface.ts';

interface PendingAlertRequest {
  readonly kind: 'alert';
  readonly request: UserRequestAlertRequest;
  readonly resolve: () => void;
}

interface PendingConfirmRequest {
  readonly kind: 'confirm';
  readonly request: UserRequestConfirmRequest;
  readonly resolve: (result: boolean) => void;
}

interface PendingPromptRequest {
  readonly kind: 'prompt';
  readonly request: UserRequestPromptRequest;
  readonly resolve: (result: string | null) => void;
}

type PendingUserRequest = PendingAlertRequest | PendingConfirmRequest | PendingPromptRequest;

@Injectable()
export class UserRequestRuntime extends UserRequestRuntimeInterface {
  private readonly listeners = new Set<UserRequestRuntimeListener>();
  private readonly requests: PendingUserRequest[] = [];

  private disposed = false;
  private sequence = 0;

  constructor(@Inject(DisposableRegistryInterface) disposables: DisposableRegistryInterface) {
    super();
    disposables.add(this);
  }

  apply(requestId: string, value?: string): void {
    const request = this.takeCurrent(requestId);

    if (!request) {
      return;
    }

    if (request.kind === 'alert') {
      request.resolve();
    } else if (request.kind === 'confirm') {
      request.resolve(true);
    } else {
      request.resolve(value ?? '');
    }
  }

  cancel(requestId: string): void {
    const request = this.takeCurrent(requestId);

    if (!request) {
      return;
    }

    this.resolveCancellation(request);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    const requests = this.requests.splice(0);

    this.listeners.clear();

    for (const request of requests) {
      this.resolveCancellation(request);
    }
  }

  getSnapshot<TContent = unknown>(): UserRequestRequest<TContent> | null {
    // TContent is owned by the renderer facade and erased in the application-scoped queue.
    return (this.requests[0]?.request as UserRequestRequest<TContent> | undefined) ?? null;
  }

  open<TContent>(kind: 'alert', payload: UserRequestAlertPayload<TContent>): Promise<void>;
  open<TContent>(kind: 'confirm', payload: UserRequestConfirmPayload<TContent>): Promise<boolean>;
  open<TContent>(kind: 'prompt', payload: UserRequestPromptPayload<TContent>): Promise<string | null>;
  open<TContent>(
    kind: UserRequestKind,
    payload: UserRequestBasePayload<TContent>,
  ): Promise<void | boolean | string | null> {
    this.assertActive();

    if (kind === 'alert') {
      return new Promise<void>((resolve) => {
        this.enqueue({
          kind,
          request: Object.freeze({ id: this.createId(), kind, payload }),
          resolve,
        });
      });
    }

    if (kind === 'confirm') {
      return new Promise<boolean>((resolve) => {
        this.enqueue({
          kind,
          request: Object.freeze({ id: this.createId(), kind, payload }),
          resolve,
        });
      });
    }

    return new Promise<string | null>((resolve) => {
      this.enqueue({
        kind,
        request: Object.freeze({ id: this.createId(), kind, payload }),
        resolve,
      });
    });
  }

  subscribe(listener: UserRequestRuntimeListener): () => void {
    this.assertActive();
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('UserRequestRuntime уже освобожден.');
    }
  }

  private createId(): string {
    this.sequence++;

    return `user-request-${Date.now()}-${this.sequence}`;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private enqueue(request: PendingUserRequest): void {
    const shouldEmit = this.requests.length === 0;

    this.requests.push(request);

    if (shouldEmit) {
      this.emit();
    }
  }

  private resolveCancellation(request: PendingUserRequest): void {
    if (request.kind === 'alert') {
      request.resolve();
    } else if (request.kind === 'confirm') {
      request.resolve(false);
    } else {
      request.resolve(null);
    }
  }

  private takeCurrent(requestId: string): PendingUserRequest | null {
    const request = this.requests[0];

    if (!request || request.request.id !== requestId) {
      return null;
    }

    this.requests.shift();
    this.emit();

    return request;
  }
}
