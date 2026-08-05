import { describe, expect, it } from 'vitest';

import { ApplicationStore } from './application-store.ts';

describe('ApplicationStore', () => {
  it('stores and reads typed single values by class key', () => {
    const store = new ApplicationStore();
    const profile = new ProfileModel('Ada');

    store.set(ProfileModel, profile);

    expect(store.has(ProfileModel)).toBe(true);
    expect(store.get(ProfileModel)).toBe(profile);
    expect(store.get(SessionModel)).toBeUndefined();
  });

  it('stores many values as a copied array', () => {
    const store = new ApplicationStore();
    const profiles = [new ProfileModel('Ada'), new ProfileModel('Grace')];

    store.setMany(ProfileModel, profiles);

    const storedProfiles = store.getMany(ProfileModel);

    profiles.push(new ProfileModel('Linus'));

    expect(storedProfiles).toEqual([new ProfileModel('Ada'), new ProfileModel('Grace')]);
    expect(store.get(ProfileModel)).toBeUndefined();
  });

  it('deletes and clears entries', () => {
    const store = new ApplicationStore();

    store.set(ProfileModel, new ProfileModel('Ada'));
    store.set(SessionModel, new SessionModel('active'));
    store.delete(ProfileModel);

    expect(store.has(ProfileModel)).toBe(false);
    expect(store.has(SessionModel)).toBe(true);

    store.clear();

    expect(store.has(SessionModel)).toBe(false);
  });
});

class ProfileModel {
  constructor(readonly name: string) {}
}

class SessionModel {
  constructor(readonly status: string) {}
}
