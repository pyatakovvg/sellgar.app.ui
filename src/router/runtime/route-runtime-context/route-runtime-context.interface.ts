import type { PolicyDeclaration } from '../../../policy/declaration/policy-declaration';
import type { RuntimeContextInterface } from '../../../runtime/context';

export type RoutePolicyBoundary = 'canAction' | 'canActivate' | 'canMatch';

export interface RouteRuntimeContextInterface extends RuntimeContextInterface {
  readonly params: Record<string, string | undefined>;
}

export type RoutePolicyDeclaration = PolicyDeclaration<RouteRuntimeContextInterface>;

export type RoutePolicyDeclarations = Record<RoutePolicyBoundary, readonly RoutePolicyDeclaration[]>;
