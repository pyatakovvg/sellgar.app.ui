import { NotificationServiceInterface } from '../../../../../core/features/notification/contract/notification-service';
import { useDependency } from '../../../../runtime/scope/runtime-scope-context';
import type { NotificationService } from '../../contract/notification-service';

export const useNotification = (): NotificationService => {
  return useDependency(NotificationServiceInterface);
};
