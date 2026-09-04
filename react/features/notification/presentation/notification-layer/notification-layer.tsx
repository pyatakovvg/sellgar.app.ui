import React from 'react';

import { NotificationRuntimeInterface } from '../../../../../core/features/notification/runtime/notification-runtime';
import type { NotificationRequest as CoreNotificationRequest } from '../../../../../core/features/notification/runtime/notification-runtime';
import { useDependency } from '../../../../runtime/scope/runtime-scope-context';
import type { NotificationPresentation } from '../../declaration/notification-presentation';
import { NotificationContainer } from './notification-container';

const EMPTY_NOTIFICATIONS: readonly CoreNotificationRequest<React.ReactNode>[] = Object.freeze([]);

interface IProps {
  readonly presentation: NotificationPresentation;
}

export const NotificationLayer: React.FC<IProps> = (props) => {
  const runtime = useDependency(NotificationRuntimeInterface);
  const notifications = React.useSyncExternalStore(
    React.useCallback((listener) => runtime.subscribe(listener), [runtime]),
    React.useCallback(() => runtime.getSnapshot<React.ReactNode>(), [runtime]),
    () => EMPTY_NOTIFICATIONS,
  );

  return <NotificationContainer notifications={notifications} presentation={props.presentation} runtime={runtime} />;
};
