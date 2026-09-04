import { Inject, Injectable } from '../../../../di/injection/decorators';
import {
  UserRequestServiceInterface,
  type UserRequestAlertPayload,
  type UserRequestConfirmPayload,
  type UserRequestPromptPayload,
} from '../../contract/user-request-service';

import { UserRequestRuntimeInterface } from './user-request-runtime.interface.ts';

@Injectable()
export class UserRequestService extends UserRequestServiceInterface<unknown> {
  constructor(@Inject(UserRequestRuntimeInterface) private readonly runtime: UserRequestRuntimeInterface) {
    super();
  }

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
