import { describe, expect, it } from 'vitest';

import { createRoutePathname } from './route-pathname.utils.ts';

describe('createRoutePathname', () => {
  it.each([
    [undefined, undefined, '/'],
    [undefined, '/terminals', '/terminals'],
    ['/terminals', undefined, '/terminals'],
    ['/terminals', '/registrations', '/terminals/registrations'],
    ['/terminals/registrations', '/archive', '/terminals/registrations/archive'],
  ])('composes parent %s and route %s as %s', (parentPathname, path, expected) => {
    expect(createRoutePathname(parentPathname, path)).toBe(expected);
  });
});
