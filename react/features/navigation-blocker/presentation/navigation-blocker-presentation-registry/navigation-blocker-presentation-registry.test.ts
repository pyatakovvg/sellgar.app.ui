import { describe, expect, it } from 'vitest';

import type { NavigationBlockerRegistrationIdentity } from '../../../../../core/features/navigation-blocker/contract/navigation-blocker-service';
import { NavigationBlockerPresentation } from '../../declaration/navigation-blocker-presentation';
import { NavigationBlockerPresentationRegistry } from './navigation-blocker-presentation-registry.ts';

describe('NavigationBlockerPresentationRegistry', () => {
  it('resolves the first renderer presentation in core registration priority', () => {
    const registry = new NavigationBlockerPresentationRegistry();
    const parentIdentity = 1 as NavigationBlockerRegistrationIdentity;
    const nestedIdentity = 2 as NavigationBlockerRegistrationIdentity;
    const ParentView = () => null;
    const NestedView = () => null;
    const parentPresentation = NavigationBlockerPresentation.define(ParentView);
    const nestedPresentation = NavigationBlockerPresentation.define(NestedView);

    registry.register(parentIdentity, parentPresentation);
    const unregisterNested = registry.register(nestedIdentity, nestedPresentation);

    expect(registry.resolve([nestedIdentity, parentIdentity])).toBe(nestedPresentation);

    unregisterNested();

    expect(registry.resolve([nestedIdentity, parentIdentity])).toBe(parentPresentation);
  });
});
