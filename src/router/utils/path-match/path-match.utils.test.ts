import { describe, expect, it } from 'vitest';

import { matchPathname } from './path-match.utils.ts';

describe('matchPathname', () => {
  it('matches the same pathname with end option', () => {
    expect(matchPathname('/employees', '/employees', { end: true })).toBe(true);
  });

  it('does not match child pathnames with end option', () => {
    expect(matchPathname('/employees/invitations', '/employees', { end: true })).toBe(false);
  });

  it('matches child pathnames by default', () => {
    expect(matchPathname('/employees/invitations', '/employees')).toBe(true);
  });

  it('does not match pathname prefixes outside route segment boundary', () => {
    expect(matchPathname('/employees-old', '/employees')).toBe(false);
  });

  it('matches every pathname from root without end option', () => {
    expect(matchPathname('/employees', '/')).toBe(true);
  });

  it('matches only root from root with end option', () => {
    expect(matchPathname('/employees', '/', { end: true })).toBe(false);
    expect(matchPathname('/', '/', { end: true })).toBe(true);
  });

  it('normalizes missing leading slashes, duplicated slashes and trailing slashes', () => {
    expect(matchPathname('employees//invitations/', '/employees/invitations', { end: true })).toBe(true);
  });
});
