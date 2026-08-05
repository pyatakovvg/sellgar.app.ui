import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router-dom';

import type { PolicyDeclaration } from '../../../policy/declaration/policy-declaration';
import type { RuntimeContextInterface } from '../../../runtime/context';

export type RoutePolicyBoundary = 'canAction' | 'canActivate' | 'canMatch';

export interface RouteRuntimeContextInterface extends RuntimeContextInterface {
  readonly params: ActionFunctionArgs['params'] | LoaderFunctionArgs['params'];
  readonly request: Request;
}

export type RoutePolicyDeclaration = PolicyDeclaration<RouteRuntimeContextInterface>;

export type RoutePolicyDeclarations = Record<RoutePolicyBoundary, readonly RoutePolicyDeclaration[]>;
