import { describe, expect, it } from 'vitest';

import { NOTIFICATION_PLACEMENTS } from '../../../contract/notification-service';

import { resolveNotificationPlacement } from './notification-placement.resolver.ts';

describe('resolveNotificationPlacement for Native', () => {
  it('preserves every configured placement', () => {
    expect(NOTIFICATION_PLACEMENTS).toHaveLength(8);

    for (const placement of NOTIFICATION_PLACEMENTS) {
      expect(resolveNotificationPlacement({ placement })).toBe(placement);
    }
  });

  it('uses bottom-right when placement is absent or invalid', () => {
    expect(resolveNotificationPlacement({})).toBe('bottom-right');
    expect(resolveNotificationPlacement({ placement: 'unknown' })).toBe('bottom-right');
  });
});
