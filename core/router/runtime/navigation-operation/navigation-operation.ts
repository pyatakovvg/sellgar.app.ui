import type { RouterBridgeNavigationSource } from '../../bridge/router-bridge';
import type { NavigationState } from '../navigation-state';

export type NavigationTrigger =
  | 'target'
  | 'root'
  | 'query'
  | 'close'
  | 'bridge-request'
  | 'restore'
  | 'history'
  | 'redirect'
  | 'session'
  | 'recovery';

export interface NavigationOperation {
  readonly id: symbol;
  readonly parent: NavigationOperation | null;
  readonly requested: NavigationState;
  readonly source: RouterBridgeNavigationSource;
  readonly trigger: NavigationTrigger;
}

export const createNavigationOperation = (
  trigger: NavigationTrigger,
  source: RouterBridgeNavigationSource,
  requested: NavigationState,
  parent: NavigationOperation | null = null,
): NavigationOperation => Object.freeze({ id: Symbol(trigger), parent, requested, source, trigger });
