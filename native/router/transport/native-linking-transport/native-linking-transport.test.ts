import { afterEach, describe, expect, it, vi } from 'vitest';

const linking = vi.hoisted(() => ({
  getInitialURL: vi.fn<() => Promise<string | null>>(),
  listener: null as ((event: { url: string }) => void) | null,
  remove: vi.fn(),
}));

vi.mock('react-native', () => ({
  Linking: {
    getInitialURL: linking.getInitialURL,
    addEventListener: (_event: string, listener: (event: { url: string }) => void) => {
      linking.listener = listener;
      return { remove: linking.remove };
    },
  },
}));

import type { NavigationRequestFactory } from '../../../../core/router/service/navigation-request';
import { createNativeLinkingTransport } from './native-linking-transport.ts';

afterEach(() => {
  linking.getInitialURL.mockReset();
  linking.listener = null;
  linking.remove.mockReset();
});

describe('NativeLinkingTransport URL resolution', () => {
  it('keeps address decoding as the default for both initial and event URLs', async () => {
    linking.getInitialURL.mockResolvedValue('https://wallet.example/wallets/cards?tab=saved');
    const transport = createNativeLinkingTransport({ prefixes: ['https://wallet.example/wallets'] });
    const initial = await transport.getInitialLocation(new AbortController().signal);
    expect(initial).toMatchObject({ address: ['cards'], query: { tab: 'saved' } });
    const listener = vi.fn();
    const unsubscribe = transport.subscribe(listener);
    linking.listener!({ url: 'https://wallet.example/wallets/cards?tab=saved' });
    expect(listener).toHaveBeenCalledWith(initial);
    unsubscribe();
    expect(linking.remove).toHaveBeenCalledOnce();
  });

  it('uses the same resolver for initial and event URLs and ignores null results', async () => {
    class DashboardRoute {}
    const target: NavigationRequestFactory = (navigate) => navigate.to(DashboardRoute);
    const resolve = vi.fn((url: string) => (url === 'wallet://dashboard' ? target : null));
    linking.getInitialURL.mockResolvedValue('wallet://dashboard');
    const transport = createNativeLinkingTransport({ resolve });
    expect(await transport.getInitialLocation(new AbortController().signal)).toBe(target);
    const listener = vi.fn();
    const unsubscribe = transport.subscribe(listener);
    linking.listener!({ url: 'wallet://dashboard' });
    linking.listener!({ url: 'wallet://unknown' });
    expect(listener).toHaveBeenCalledExactlyOnceWith(target);
    expect(resolve.mock.calls.map(([url]) => url)).toEqual([
      'wallet://dashboard',
      'wallet://dashboard',
      'wallet://unknown',
    ]);
    unsubscribe();
  });

  it('does not resolve a URL after initialization is aborted', async () => {
    let complete!: (url: string) => void;
    linking.getInitialURL.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const resolve = vi.fn(() => null);
    const transport = createNativeLinkingTransport({ resolve });
    const controller = new AbortController();
    const initial = transport.getInitialLocation(controller.signal);
    controller.abort();
    complete('wallet://dashboard');
    expect(await initial).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });
});
