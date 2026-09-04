export { Application } from './application/lifecycle/application';
export type { ApplicationOptions } from './application/lifecycle/application';
export { ApplicationConfiguratorInterface } from './application/config/application-configurator';
export type {
  ApplicationComponents,
  ApplicationRouting,
  ResolvedApplicationRouting,
} from './application/config/application-configurator';

export { Layout } from './layout/declaration/layout';
export type { LayoutConstructor, LayoutMetadata, LayoutViewProps } from './layout/declaration/layout';

export { Module } from './module/declaration/module';
export type { ModuleConstructor, ModuleMetadata } from './module/declaration/module';

export type { RenderableView } from './view/renderable-view';

export { useController } from './controller/hook/use-controller';
export { useLoaderData } from './controller/hook/use-loader-data';
export { useParams } from './controller/hook/use-params';
export { useSubmit, type ControllerSubmit } from './controller/hook/use-submit';

export { useRevalidate, type RevalidateHandler } from './revalidate/hook/use-revalidate';

export { useGuard } from './guard/hook/use-guard';
export { Guarded, type GuardedProps } from './guard/rendering/guarded';

export {
  NavigationBlockerFeature,
  type NavigationBlockerFeatureOptions,
} from './features/navigation-blocker/navigation-blocker-feature';
export { NavigationBlockerPresentation } from './features/navigation-blocker/declaration/navigation-blocker-presentation';
export {
  useBlocker,
  type NavigationBlockerConditionValue,
  type UseBlockerOptions,
} from './features/navigation-blocker/hook/use-blocker';
export type { NavigationBlockerViewProps } from './features/navigation-blocker/presentation/navigation-blocker-view-props';

export { NotificationFeature, type NotificationFeatureOptions } from './features/notification/notification-feature';
export { NotificationPresentation } from './features/notification/declaration/notification-presentation';
export { useNotification } from './features/notification/hook/use-notification';
export type {
  NotificationPayload,
  NotificationPlacement,
  NotificationService,
} from './features/notification/contract/notification-service';
export type { NotificationViewProps } from './features/notification/presentation/notification-view-props';

export { UserRequestFeature, type UserRequestFeatureOptions } from './features/user-request/user-request-feature';
export { UserRequestPresentation } from './features/user-request/declaration/user-request-presentation';
export { useUserRequest } from './features/user-request/hook/use-user-request';
export type {
  UserRequestAlertPayload,
  UserRequestBasePayload,
  UserRequestConfirmPayload,
  UserRequestPromptPayload,
  UserRequestService,
} from './features/user-request/contract/user-request-service';
export type {
  UserRequestAlertViewProps,
  UserRequestConfirmViewProps,
  UserRequestPromptViewProps,
} from './features/user-request/presentation/user-request-view-props';

export { useDependency } from './runtime/scope/runtime-scope-context';
export { useException } from './runtime/exception/exception-context';

export { Reactive, type ReactiveProps } from './reactive/reactive-boundary';
export { reactive } from './reactive/reactive';

export { Widget, WidgetDefinition } from './widget/declaration/widget';
export type { WidgetConstructor, WidgetMetadata, WidgetProps } from './widget/declaration/widget';
export { WidgetHost } from './widget/rendering/widget-host';
export type { WidgetHostProps } from './widget/rendering/widget-host';
export { useWidgetProps } from './widget/hook/use-widget-props';
export { WidgetPreloaderInterface } from '../core/widget/service/widget-preloader';
export type { WidgetPreloadOptions } from '../core/widget/service/widget-preloader';

export type { RouteDeclaration } from '../core/router/declaration/route';
export { createWebRouterBridge } from './router/bridge/web-router-bridge';
export type { WebRouterBridgeOptions } from './router/bridge/web-router-bridge';
export { Route } from './router/declaration/route';
export type { RouteOptions } from './router/declaration/route';
export { Router } from './router/declaration/router';
export type { RouterOptions } from './router/declaration/router';
export { Shell, ShellInterface } from './router/declaration/shell';
export type { ShellContextInterface } from './router/declaration/shell';
export { useLocation, type LocationHandler } from './router/hook/use-location';
export { useQuery } from './router/hook/use-query';
export { useNavigate } from './router/hook/use-navigate';
export { useRouteActive } from './router/hook/use-route-active';
export { useRoutePending } from './router/hook/use-route-pending';
export { NavItem } from './router/nav-item';
export { NavLink } from './router/nav-link';
