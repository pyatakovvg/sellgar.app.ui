import { describe, expect, it } from 'vitest';

import type { NotificationRequest as CoreNotificationRequest } from '../../../../../../core/features/notification/runtime/notification-runtime';

import { groupNotifications } from './notification-groups.ts';

describe('groupNotifications for Native', () => {
  it('groups by renderer placement without changing queue order', () => {
    const notifications = [
      { id: '1', placement: 'top-left', status: 'info' },
      { id: '2', placement: 'bottom-right', status: 'success' },
      { id: '3', placement: 'top-left', status: 'destructive' },
    ] satisfies readonly CoreNotificationRequest<unknown>[];

    const groups = groupNotifications(notifications);

    expect(groups['top-left'].map((notification) => notification.id)).toEqual(['1', '3']);
    expect(groups['bottom-right'].map((notification) => notification.id)).toEqual(['2']);
  });
});
