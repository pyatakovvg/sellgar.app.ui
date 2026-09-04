import { UserRequestServiceInterface } from '../../../../../core/features/user-request/contract/user-request-service';
import { useDependency } from '../../../../runtime/scope/runtime-scope-context';
import type { UserRequestService } from '../../contract/user-request-service';

export const useUserRequest = (): UserRequestService => {
  return useDependency(UserRequestServiceInterface);
};
