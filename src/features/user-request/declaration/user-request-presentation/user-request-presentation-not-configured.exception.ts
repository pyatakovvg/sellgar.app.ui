import type { UserRequestKind } from '../../runtime/user-request-runtime';

export class UserRequestPresentationNotConfiguredException extends Error {
  constructor(kind: UserRequestKind) {
    super(`Не настроено представление для user request "${kind}".`);
    this.name = 'UserRequestPresentationNotConfiguredException';
  }
}
