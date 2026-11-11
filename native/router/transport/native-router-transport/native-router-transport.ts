import type { RouterBridgeLocationInterface } from '../../../../core/router/bridge/router-bridge';
import type { NavigationRequestFactory } from '../../../../core/router/service/navigation-request';

export type NativeRouterTransportTarget = RouterBridgeLocationInterface | NavigationRequestFactory;

export type NativeRouterTransportListener<TTarget extends NativeRouterTransportTarget = RouterBridgeLocationInterface> =
  (target: TTarget) => void;

export interface NativeRouterTransportInterface<
  TTarget extends NativeRouterTransportTarget = RouterBridgeLocationInterface,
> {
  getInitialLocation(signal: AbortSignal): Promise<TTarget | null>;

  subscribe(listener: NativeRouterTransportListener<TTarget>): () => void;
}
