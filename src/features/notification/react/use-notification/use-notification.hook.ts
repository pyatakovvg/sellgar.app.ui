import { useDependency } from '../../../../runtime/react';
import { NotificationServiceInterface } from '../../contract/notification-service';

export const useNotification = (): NotificationServiceInterface => {
  return useDependency(NotificationServiceInterface);
};
