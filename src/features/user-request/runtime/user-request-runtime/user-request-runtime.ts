import {
  type UserRequestKind,
  type UserRequestPayloadByKind,
  type UserRequestRequest,
  type UserRequestResultByKind,
} from './user-request-request.ts';
import { UserRequestRuntimeInterface, type UserRequestRuntimeListener } from './user-request-runtime.interface.ts';

export class UserRequestRuntime extends UserRequestRuntimeInterface {
  private readonly listeners = new Set<UserRequestRuntimeListener>();
  private readonly requests: UserRequestRequest[] = [];
  private revision = 0;

  apply(requestId: string, value?: string): void {
    const request = this.findRequest(requestId);

    if (request === null) {
      return;
    }

    if (request.kind === 'alert') {
      request.resolve();
    } else if (request.kind === 'confirm') {
      request.resolve(true);
    } else {
      request.resolve(value ?? '');
    }

    this.remove(requestId);
  }

  cancel(requestId: string): void {
    const request = this.findRequest(requestId);

    if (request === null) {
      return;
    }

    if (request.kind === 'alert') {
      request.resolve();
    } else if (request.kind === 'confirm') {
      request.resolve(false);
    } else {
      request.resolve(null);
    }

    this.remove(requestId);
  }

  getSnapshot(): UserRequestRequest | null {
    return this.requests[0] ?? null;
  }

  open<TKind extends UserRequestKind>(
    kind: TKind,
    payload: UserRequestPayloadByKind<TKind>,
  ): Promise<UserRequestResultByKind<TKind>> {
    return new Promise<UserRequestResultByKind<TKind>>((resolve) => {
      this.requests.push({
        id: createUserRequestId(this.revision),
        kind,
        payload,
        resolve: resolve as (result: unknown) => void,
      } as UserRequestRequest);
      this.emit();
    });
  }

  subscribe(listener: UserRequestRuntimeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    this.revision++;

    for (const listener of this.listeners) {
      listener();
    }
  }

  private findRequest(requestId: string): UserRequestRequest | null {
    return this.requests.find((request) => request.id === requestId) ?? null;
  }

  private remove(requestId: string): void {
    const requestIndex = this.requests.findIndex((request) => request.id === requestId);

    if (requestIndex === -1) {
      return;
    }

    this.requests.splice(requestIndex, 1);
    this.emit();
  }
}

const createUserRequestId = (revision: number): string => {
  return `user-request-${Date.now()}-${revision}`;
};
