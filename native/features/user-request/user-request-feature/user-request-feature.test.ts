import { describe, expect, it, vi } from 'vitest';

// The feature composition contract does not render native UI.
vi.mock('../presentation/user-request-layer', () => ({ UserRequestLayer: () => null }));

import { ApplicationFeatureInterface } from '../../../../core/application/feature/application-feature';
import { getUseBindingsMetadata } from '../../../../core/di/composition/use-bindings';
import { UserRequestPresentation } from '../declaration/user-request-presentation';
import { UserRequestFeature } from './user-request-feature.tsx';

describe('Native UserRequestFeature facade', () => {
  it('uses the core feature lifecycle with a Native presentation contract', () => {
    const feature = UserRequestFeature.configure({
      presentation: UserRequestPresentation.define((registry) => registry.alert(() => null)),
    });

    expect(feature).toBeInstanceOf(ApplicationFeatureInterface);
    expect(getUseBindingsMetadata(feature)).toHaveLength(1);
  });
});
