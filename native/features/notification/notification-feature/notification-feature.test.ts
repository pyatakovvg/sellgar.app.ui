import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Pressable: () => null,
  StyleSheet: {
    absoluteFillObject: {},
    create: <TStyles extends object>(styles: TStyles): TStyles => styles,
  },
  View: () => null,
}));

import { isApplicationFeatureToken } from '../../../../core/application/feature/application-feature';
import { getUseBindingsMetadata } from '../../../../core/di/composition/use-bindings';
import { NotificationPresentation } from '../declaration/notification-presentation';
import { NotificationFeature } from './notification-feature.tsx';

describe('Native NotificationFeature facade', () => {
  it('uses the core feature lifecycle with a Native presentation contract', () => {
    const feature = NotificationFeature.configure({
      presentation: NotificationPresentation.define((registry) => registry.info(() => null)),
    });

    expect(isApplicationFeatureToken(feature)).toBe(true);
    expect(getUseBindingsMetadata(feature)).toHaveLength(1);
  });
});
