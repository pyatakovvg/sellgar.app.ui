import { describe, expect, it } from 'vitest';

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
