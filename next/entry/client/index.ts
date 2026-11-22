export {
  Application,
  type ApplicationFactory,
  type ApplicationFactoryContext,
} from '../../application/lifecycle/application';
export type {
  ApplicationConfiguratorInterface,
  ApplicationComponents,
} from '../../application/config/application-config';
export { useApplication } from '../../application/hook/use-application';
export { Link } from '../../router/link';
export { useDependency } from '../../application/hook/use-dependency';
export { Module } from '../../../react/module/declaration/module';
export type { ModuleConstructor, ModuleMetadata } from '../../../react/module/declaration/module';
export { useController, useLoaderData, useSubmit, useRevalidate } from '../../controller/hook/controller-hooks';
export { useModuleReady } from '../../module/hook/use-module-ready';
export { Layout } from '../../../react/layout/declaration/layout';
export type { LayoutConstructor, LayoutMetadata, LayoutViewProps } from '../../../react/layout/declaration/layout';
export { useModuleReady as useLayoutReady } from '../../module/hook/use-module-ready';

export { Metadata, type MetadataValues } from '../../../core/metadata/declaration/metadata';
export {
  MetadataServiceInterface,
  type MetadataGetters,
  type MetadataSetters,
  type MetadataResets,
} from '../../../core/metadata/service/metadata-service';
export {
  composeMetadata,
  formatMetadataTitle,
  type MetadataComposition,
  type MetadataCompositionOptions,
} from '../../../core/metadata/composition/metadata-composition';

export { Widget, WidgetDefinition } from '../../../react/widget/declaration/widget';
export type { WidgetConstructor, WidgetMetadata, WidgetProps } from '../../../react/widget/declaration/widget';

export { ApplicationStateInterface } from '../../application/state/application-state';
export type { ApplicationSnapshot, ApplicationStateToken } from '../../application/state/application-state';
export { useApplicationState, useReadyApplication } from '../../application/state/application-state-context';

export {
  NotificationFeature,
  type NotificationFeatureOptions,
} from '../../../react/features/notification/notification-feature';
export { NotificationPresentation } from '../../../react/features/notification/declaration/notification-presentation';
export type { NotificationViewProps } from '../../../react/features/notification/presentation/notification-view-props';
