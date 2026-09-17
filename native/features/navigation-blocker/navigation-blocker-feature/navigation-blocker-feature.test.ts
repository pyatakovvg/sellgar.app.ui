import { describe, expect, it, vi } from 'vitest';

// The feature composition contract does not render native UI.
vi.mock('../presentation/navigation-blocker-layer', () => ({ NavigationBlockerLayer: () => null }));

import { ApplicationFeatureInterface } from '../../../../core/application/feature/application-feature';
import { getUseBindingsMetadata } from '../../../../core/di/composition/use-bindings';
import { NavigationBlockerPresentation } from '../declaration/navigation-blocker-presentation';
import { NavigationBlockerFeature } from './navigation-blocker-feature.tsx';

describe('Native NavigationBlockerFeature facade', () => {
  it('uses the core feature lifecycle with a Native presentation contract', () => {
    const View = () => null;
    const feature = NavigationBlockerFeature.configure({
      presentation: NavigationBlockerPresentation.define(View),
    });

    expect(feature).toBeInstanceOf(ApplicationFeatureInterface);
    expect(getUseBindingsMetadata(feature)).toHaveLength(2);
  });
});
