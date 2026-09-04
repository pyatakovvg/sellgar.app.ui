import type { PolicyDeclaration } from '../../../policy/declaration/policy-declaration';
import type { RuntimeContextInterface } from '../../../runtime/context/runtime-context';

export type RoutePolicyBoundary = 'canAction' | 'canActivate' | 'canMatch';

export interface RouteRuntimeContextInterface extends RuntimeContextInterface {
  readonly params: Readonly<Record<string, unknown>>;
}

export type RoutePolicyDeclaration = PolicyDeclaration<RouteRuntimeContextInterface>;

export type RoutePolicyDeclarations = Record<RoutePolicyBoundary, readonly RoutePolicyDeclaration[]>;
