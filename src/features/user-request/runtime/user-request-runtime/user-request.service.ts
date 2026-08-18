import type {
  UserRequestAlertPayload,
  UserRequestConfirmPayload,
  UserRequestPromptPayload,
} from '../../contract/user-request-service';
import { UserRequestServiceInterface } from '../../contract/user-request-service';
import { Inject, Injectable } from '../../../../di/injection/decorators';

import { UserRequestRuntimeInterface } from './user-request-runtime.interface.ts';

@Injectable()
export class UserRequestService implements UserRequestServiceInterface {
  constructor(
    @Inject(UserRequestRuntimeInterface)
    private readonly runtime: UserRequestRuntimeInterface,
  ) {}

  alert(payload: UserRequestAlertPayload): Promise<void> {
    return this.runtime.open('alert', payload);
  }

  confirm(payload: UserRequestConfirmPayload): Promise<boolean> {
    return this.runtime.open('confirm', payload);
  }

  prompt(payload: UserRequestPromptPayload): Promise<string | null> {
    return this.runtime.open('prompt', payload);
  }
}
