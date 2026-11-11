import { Linking } from 'react-native';

import type { RouterBridgeLocationInterface } from '../../../../core/router/bridge/router-bridge';
import type {
  NativeRouterTransportInterface,
  NativeRouterTransportListener,
  NativeRouterTransportTarget,
} from '../native-router-transport';
import { decodeNativeLocation, type NativeLocationCodecOptions } from './native-location-codec.ts';

export interface NativeLinkingTransportOptions<
  TTarget extends NativeRouterTransportTarget = RouterBridgeLocationInterface,
> extends NativeLocationCodecOptions {
  /** Map an OS URL to an address or a token-based request; null ignores the URL. */
  readonly resolve?: (url: string) => TTarget | null;
}

export class NativeLinkingTransport<
  TTarget extends NativeRouterTransportTarget = RouterBridgeLocationInterface,
> implements NativeRouterTransportInterface<TTarget | RouterBridgeLocationInterface> {
  constructor();
  constructor(options: NativeLocationCodecOptions & { readonly resolve?: never });
  constructor(
    options: NativeLinkingTransportOptions<TTarget> & NativeLinkingTransportOptions<NativeRouterTransportTarget>,
  );
  constructor(private readonly options: NativeLinkingTransportOptions<TTarget> = {}) {}

  async getInitialLocation(signal: AbortSignal): Promise<NoInfer<TTarget> | RouterBridgeLocationInterface | null> {
    const url = await Linking.getInitialURL();

    if (signal.aborted || url == null) return null;
    return this.resolve(url);
  }

  subscribe(listener: NativeRouterTransportListener<NoInfer<TTarget> | RouterBridgeLocationInterface>): () => void {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const target = this.resolve(url);

      if (target !== null) listener(target);
    });

    return () => subscription.remove();
  }

  private resolve(url: string): TTarget | RouterBridgeLocationInterface | null {
    return this.options.resolve ? this.options.resolve(url) : decodeNativeLocation(url, this.options);
  }
}

export function createNativeLinkingTransport(
  options?: NativeLocationCodecOptions & { readonly resolve?: never },
): NativeLinkingTransport;
export function createNativeLinkingTransport<TTarget extends NativeRouterTransportTarget>(
  options: NativeLinkingTransportOptions<TTarget> & NativeLinkingTransportOptions<NativeRouterTransportTarget>,
): NativeLinkingTransport<TTarget>;
export function createNativeLinkingTransport<
  TTarget extends NativeRouterTransportTarget = RouterBridgeLocationInterface,
>(options: NativeLinkingTransportOptions<TTarget> = {}): NativeLinkingTransport<TTarget> {
  return new NativeLinkingTransport<TTarget>(options);
}
