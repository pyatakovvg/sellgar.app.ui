import { createHandledRoutingErrorPresentation } from '../../../../shared/router/rendering/handled-routing-error';
import { getRoutePresentationDefinition } from '../../declaration/route';
import { getRouterPresentationDefinition } from '../../declaration/router';

export const { RoutingErrorPresentation, HandledRoutingErrorBoundary, useIsRoutingErrorHandled } =
  createHandledRoutingErrorPresentation({
    getRouteComponents: getRoutePresentationDefinition,
    getRouterComponents: getRouterPresentationDefinition,
  });
