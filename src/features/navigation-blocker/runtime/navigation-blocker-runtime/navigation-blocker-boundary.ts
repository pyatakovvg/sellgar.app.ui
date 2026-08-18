import type { FrameRouter } from '../../../../../frame/router/declaration';

export type NavigationBlockerBoundary = RouteNavigationBlockerBoundary | FrameNavigationBlockerBoundary;

export interface RouteNavigationBlockerBoundary {
  readonly kind: 'route';
  readonly routeId: string;
}

export interface FrameNavigationBlockerBoundary {
  readonly kind: 'frame';
  readonly routeId: string;
  readonly router: FrameRouter;
  readonly sourcePath: string;
}

export interface NavigationBlockerLocation {
  readonly frame: FrameNavigationBlockerBoundary | null;
  readonly routes: readonly NavigationBlockerRouteMatch[];
}

export interface NavigationBlockerRouteMatch {
  readonly id: string;
  readonly pathname: string;
}

export interface NavigationBlockerTransition {
  readonly current: NavigationBlockerLocation;
  readonly next: NavigationBlockerLocation;
}
