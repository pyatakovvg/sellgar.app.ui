import React from 'react';
import { Pressable } from 'react-native';

import type { NotificationRuntimeInterface } from '../../../../../../core/features/notification/runtime/notification-runtime';
import type { NotificationPresentation } from '../../../declaration/notification-presentation';
import type { NotificationRequest } from '../../../contract/notification-service';

interface IProps {
  readonly notification: NotificationRequest;
  readonly presentation: NotificationPresentation;
  readonly runtime: NotificationRuntimeInterface;
}

export const NotificationItem: React.FC<IProps> = (props) => {
  const View = props.presentation.resolve(props.notification.status);

  return (
    <Pressable
      onPressIn={() => props.runtime.pauseAutoClose(props.notification.id)}
      onPressOut={() => props.runtime.resumeAutoClose(props.notification.id)}
    >
      <View notification={props.notification} close={() => props.runtime.close(props.notification.id)} />
    </Pressable>
  );
};
