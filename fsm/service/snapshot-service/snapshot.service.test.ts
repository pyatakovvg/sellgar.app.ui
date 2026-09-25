import { describe, expect, it, vi } from 'vitest';
import type {
  LocationServiceInterface,
  LocationServiceListener,
  RouterLocationSnapshot,
} from '../../../core/router/service/location-service';
import { SnapshotService } from './snapshot.service';

class Ui {
  constructor(readonly language = 'ru') {}
}

class Balance {
  constructor(readonly value = 0) {}
}

class Wallet {
  readonly balance = new Balance(100);
}

class Profile {
  readonly wallet = new Wallet();
}

const createFixture = (snapshot?: unknown) => {
  let current: RouterLocationSnapshot | null = snapshot === undefined ? null : { params: {}, state: snapshot };
  const listeners = new Set<LocationServiceListener>();
  const location: LocationServiceInterface = {
    get location() {
      return current;
    },
    paramsToObject: vi.fn(),
    subscribe: vi.fn((listener: LocationServiceListener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
  return {
    service: new SnapshotService(location),
    listeners,
    publish: (value: unknown) => {
      current = { params: {}, state: value };
      listeners.forEach((listener) => listener(current));
    },
  };
};

describe('SnapshotService', () => {
  it('subscribes without replay and delivers the current token instance after each update', () => {
    const initial = new Ui();
    const { service, publish } = createFixture({ ui: initial });
    const listener = vi.fn<(value: Ui | null) => void>();
    const unsubscribe = service.subscribe(Ui, listener);
    expect(listener).not.toHaveBeenCalled();
    expect(service.get(Ui)).toBe(initial);

    const next = new Ui('kz');
    publish({ ui: next });
    expect(listener).toHaveBeenCalledExactlyOnceWith(next);
    expect(listener.mock.calls[0]?.[0]).toBe(next);

    publish({ ui: next });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('can subscribe before the first snapshot and reports missing and restored nested slices', () => {
    const { service, publish } = createFixture();
    const listener = vi.fn<(value: Balance | null) => void>();
    const unsubscribe = service.subscribe(Balance, listener);
    expect(listener).not.toHaveBeenCalled();
    expect(service.get(Balance)).toBeNull();

    const profile = new Profile();
    publish({ profile });
    publish({ profile: null });
    publish({ profile: { wallet: { balance: { value: 50 } } } });
    const restored = new Profile();
    publish({ profile: restored });
    expect(listener.mock.calls).toEqual([[profile.wallet.balance], [null], [null], [restored.wallet.balance]]);
    unsubscribe();
  });

  it('releases only the unsubscribed listener and supports repeated cleanup', () => {
    const { service, publish, listeners } = createFixture();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = service.subscribe(Ui, first);
    const unsubscribeSecond = service.subscribe(Ui, second);
    expect(listeners.size).toBe(2);
    unsubscribeFirst();
    unsubscribeFirst();
    expect(listeners.size).toBe(1);

    const ui = new Ui('en');
    publish({ ui });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith(ui);
    unsubscribeSecond();
    expect(listeners.size).toBe(0);
    publish({ ui: new Ui() });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('preserves token ambiguity errors instead of notifying with an arbitrary instance', () => {
    const { service, publish } = createFixture();
    const listener = vi.fn();
    const unsubscribe = service.subscribe(Ui, listener);
    expect(() => publish({ items: [new Ui(), new Ui('en')] })).toThrow('несколько экземпляров Ui');
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('returns the exact validated instance at every depth without copies', () => {
    const snapshot = { ui: new Ui(), profile: new Profile() };
    const { service } = createFixture(snapshot);
    expect(service.get(Ui)).toBe(snapshot.ui);
    expect(service.get(Profile)).toBe(snapshot.profile);
    expect(service.get(Wallet)).toBe(snapshot.profile.wallet);
    expect(service.get(Balance)).toBe(snapshot.profile.wallet.balance);
    expect(service.get(Ui)).toBe(service.get(Ui));
  });

  it('returns null before the first snapshot and for a missing slice', () => {
    const { service, publish } = createFixture();
    expect(service.get(Ui)).toBeNull();
    publish({ ui: new Ui(), profile: null });
    expect(service.get(Profile)).toBeNull();
    expect(service.get(Wallet)).toBeNull();
    expect(service.get(Balance)).toBeNull();
  });

  it('reads the latest snapshot and does not retain a previous profile', () => {
    const previous = { ui: new Ui(), profile: new Profile() };
    const { service, publish } = createFixture(previous);
    expect(service.get(Profile)).toBe(previous.profile);
    const next = { ui: new Ui('kz'), profile: null };
    publish(next);
    expect(service.get(Ui)).toBe(next.ui);
    expect(service.get(Profile)).toBeNull();
    expect(service.get(Balance)).toBeNull();
    expect(previous.ui.language).toBe('ru');
  });

  it('does not treat a plain object with matching fields as a token instance', () => {
    const { service } = createFixture({ ui: { language: 'ru' } });
    expect(service.get(Ui)).toBeNull();
  });

  it('uses class identity rather than the constructor name or inheritance', () => {
    const OtherUi = class Ui {
      readonly language = 'kz';
    };
    class ExtendedUi extends Ui {}
    const { service } = createFixture({ a: new OtherUi(), b: new ExtendedUi() });
    expect(service.get(Ui)).toBeNull();
    expect(service.get(OtherUi)).toBeInstanceOf(OtherUi);
    expect(service.get(ExtendedUi)).toBeInstanceOf(ExtendedUi);
  });

  it('rejects ambiguous tokens, including two instances in an array', () => {
    const { service } = createFixture({ items: [new Ui(), new Ui('en')] });
    expect(() => service.get(Ui)).toThrow('несколько экземпляров Ui');
  });

  it('supports shared references and cycles without treating them as ambiguity', () => {
    const ui = new Ui();
    const snapshot = { ui, same: ui, parent: {} };
    snapshot.parent = snapshot;
    const { service } = createFixture(snapshot);
    expect(service.get(Ui)).toBe(ui);
  });

  it('never executes getters while searching snapshot data', () => {
    const getter = vi.fn(() => {
      throw new Error('computed data');
    });
    const snapshot = { ui: new Ui() };
    Object.defineProperty(snapshot, 'computed', { get: getter, enumerable: true });
    const { service } = createFixture(snapshot);
    expect(service.get(Ui)).toBe(snapshot.ui);
    expect(getter).not.toHaveBeenCalled();
  });
});
