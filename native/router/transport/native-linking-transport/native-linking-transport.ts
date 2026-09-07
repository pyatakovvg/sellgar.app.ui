import { Linking } from 'react-native';

import type { NativeRouterTransportInterface, NativeRouterTransportListener } from '../native-router-transport';
import { decodeNativeLocation, type NativeLocationCodecOptions } from './native-location-codec.ts';

export interface NativeLinkingTransportOptions extends NativeLocationCodecOptions {}

export class NativeLinkingTransport implements NativeRouterTransportInterface {
  constructor(private readonly options: NativeLinkingTransportOptions = {}) {}

  async getInitialLocation(signal: AbortSignal) {
    const url = await Linking.getInitialURL();

    if (signal.aborted || url == null) return null;
    return decodeNativeLocation(url, this.options);
  }

  subscribe(listener: NativeRouterTransportListener): () => void {
    const subscription = Linking.addEventListener('url', ({ url }) =>
      listener(decodeNativeLocation(url, this.options)),
    );

    return () => subscription.remove();
  }
}

export const createNativeLinkingTransport = (options: NativeLinkingTransportOptions = {}): NativeLinkingTransport => {
  return new NativeLinkingTransport(options);
};
