export {
  Application,
  type ApplicationFactory,
  type ApplicationFactoryContext,
} from '../../application/lifecycle/application';
export type { ApplicationConfiguratorInterface } from '../../application/config/application-config';
export { getApplication } from '../../application/runtime/server-application';
export { useApplication } from '../../application/hook/use-application';
export { useDependency } from '../../application/hook/use-dependency';
export { Module } from '../../../react/module/declaration/module';
export type { ModuleConstructor, ModuleMetadata } from '../../../react/module/declaration/module';
export { withModule } from '../../module/rendering/module-page';
export { useController, useLoaderData, useSubmit, useRevalidate } from '../../controller/hook/controller-hooks';
export { useModuleReady } from '../../module/hook/use-module-ready';
export { Layout } from '../../../react/layout/declaration/layout';
export type { LayoutConstructor, LayoutMetadata, LayoutViewProps } from '../../../react/layout/declaration/layout';
export { withLayout, type LayoutSegmentProps } from '../../layout/rendering/segment-layout';
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
