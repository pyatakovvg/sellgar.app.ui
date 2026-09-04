import type { RouterBridgeLocationInterface } from '../../../../core/router/bridge/router-bridge';

export type NativeRouterTransportListener = (location: RouterBridgeLocationInterface) => void;

export interface NativeRouterTransportInterface {
  getInitialLocation(signal: AbortSignal): Promise<RouterBridgeLocationInterface | null>;

  subscribe(listener: NativeRouterTransportListener): () => void;
}
