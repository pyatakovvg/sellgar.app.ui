import { describe, expect, it } from 'vitest';

import { ScreenAnimation } from '../../../screen/declaration/screen-animation';
import { getRoutePresentationDefinition, Route } from './route.ts';

describe('Native Route presentation', () => {
  it('does not animate a Route by default', () => {
    const route = new Route({ load: async () => ({}) });

    expect(getRoutePresentationDefinition(route).animation).toBeUndefined();
  });

  it('keeps animation local to the configured Route', () => {
    const child = new Route({ load: async () => ({}) });
    const route = new Route({
      animation: ScreenAnimation.SlideFromRight,
      routes: [child],
    });

    expect(getRoutePresentationDefinition(route).animation).toBe(ScreenAnimation.SlideFromRight);
    expect(getRoutePresentationDefinition(child).animation).toBeUndefined();
  });
});
