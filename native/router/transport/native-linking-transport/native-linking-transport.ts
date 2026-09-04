import type { NativeRouterTransportInterface, NativeRouterTransportListener } from '../native-router-transport';
import { decodeNativeLocation, type NativeLocationCodecOptions } from './native-location-codec.ts';

export interface NativeLinkingTransportOptions extends NativeLocationCodecOptions {}

export class NativeLinkingTransport implements NativeRouterTransportInterface {
  constructor(private readonly options: NativeLinkingTransportOptions = {}) {}

  async getInitialLocation(signal: AbortSignal) {
    const { Linking } = await import('react-native');
    const url = await Linking.getInitialURL();

    if (signal.aborted || url === null) return null;
    return decodeNativeLocation(url, this.options);
  }

  subscribe(listener: NativeRouterTransportListener): () => void {
    let active = true;
    let remove: (() => void) | null = null;

    void import('react-native').then(({ Linking }) => {
      if (!active) return;

      const subscription = Linking.addEventListener('url', ({ url }) =>
        listener(decodeNativeLocation(url, this.options)),
      );
      remove = () => subscription.remove();
    });

    return () => {
      active = false;
      remove?.();
    };
  }
}

export const createNativeLinkingTransport = (options: NativeLinkingTransportOptions = {}): NativeLinkingTransport => {
  return new NativeLinkingTransport(options);
};
