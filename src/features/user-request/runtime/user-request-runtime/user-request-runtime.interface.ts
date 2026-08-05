import type {
  UserRequestKind,
  UserRequestPayloadByKind,
  UserRequestRequest,
  UserRequestResultByKind,
} from './user-request-request.ts';

export type UserRequestRuntimeListener = () => void;

export abstract class UserRequestRuntimeInterface {
  abstract apply(requestId: string, value?: string): void;

  abstract cancel(requestId: string): void;

  abstract getSnapshot(): UserRequestRequest | null;

  abstract open<TKind extends UserRequestKind>(
    kind: TKind,
    payload: UserRequestPayloadByKind<TKind>,
  ): Promise<UserRequestResultByKind<TKind>>;

  abstract subscribe(listener: UserRequestRuntimeListener): () => void;
}
