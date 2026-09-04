import { describe, expect, it } from 'vitest';

import type { NavigationBlockerRegistrationIdentity } from '../../../../../core/features/navigation-blocker/contract/navigation-blocker-service';
import { NavigationBlockerPresentation } from '../../declaration/navigation-blocker-presentation';
import { NavigationBlockerPresentationRegistry } from './navigation-blocker-presentation-registry.ts';

describe('Native NavigationBlockerPresentationRegistry', () => {
  it('uses core registration order and cleans renderer-local presentations', () => {
    const registry = new NavigationBlockerPresentationRegistry();
    const parentIdentity = 1 as NavigationBlockerRegistrationIdentity;
    const nestedIdentity = 2 as NavigationBlockerRegistrationIdentity;
    const parentPresentation = NavigationBlockerPresentation.define(() => null);
    const nestedPresentation = NavigationBlockerPresentation.define(() => null);

    registry.register(parentIdentity, parentPresentation);
    const unregisterNested = registry.register(nestedIdentity, nestedPresentation);

    expect(registry.resolve([nestedIdentity, parentIdentity])).toBe(nestedPresentation);

    unregisterNested();

    expect(registry.resolve([nestedIdentity, parentIdentity])).toBe(parentPresentation);
  });
});
