import React from 'react';

import type { NotificationRuntimeInterface } from '../../../../../../core/features/notification/runtime/notification-runtime';
import type { NotificationPresentation } from '../../../declaration/notification-presentation';
import type { NotificationRequest } from '../../../contract/notification-service';

import s from './default.module.scss';

interface IProps {
  readonly notification: NotificationRequest;
  readonly presentation: NotificationPresentation;
  readonly runtime: NotificationRuntimeInterface;
}

export const NotificationItem: React.FC<IProps> = (props) => {
  const View = props.presentation.resolve(props.notification.status);

  const handleBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }

    props.runtime.resumeAutoClose(props.notification.id);
  };

  return (
    <div
      className={s.wrapper}
      onBlur={handleBlur}
      onFocus={() => props.runtime.pauseAutoClose(props.notification.id)}
      onMouseEnter={() => props.runtime.pauseAutoClose(props.notification.id)}
      onMouseLeave={() => props.runtime.resumeAutoClose(props.notification.id)}
    >
      <View notification={props.notification} close={() => props.runtime.close(props.notification.id)} />
    </div>
  );
};
