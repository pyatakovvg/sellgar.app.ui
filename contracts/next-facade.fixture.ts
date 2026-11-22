import type * as Next from '../next';

type Assert<TValue extends true> = TValue;
type HasNoRuntimeAccess<TValue> =
  Extract<keyof TValue, 'contextScope' | 'contextFeatures' | 'retainModule'> extends never ? true : false;

export type ApplicationBoundary = Assert<HasNoRuntimeAccess<Next.Application>>;
export type ClientApplicationBoundary = Assert<HasNoRuntimeAccess<NonNullable<ReturnType<typeof Next.useApplication>>>>;
export type ServerApplicationBoundary = Assert<HasNoRuntimeAccess<Awaited<ReturnType<typeof Next.getApplication>>>>;
export type NextFacadeBoundary = Assert<'getApplicationRuntime' extends keyof typeof Next ? false : true>;

export type NextApplicationProviders = Assert<
  'providers' extends keyof Next.ApplicationConfiguratorInterface ? true : false
>;

export type NextApplicationComponents = Assert<
  'components' extends keyof Next.ApplicationConfiguratorInterface ? true : false
>;

export type NextWidgetDeclaration = Assert<'Widget' extends keyof typeof Next ? true : false>;

export type NextNotificationFeature = Assert<'NotificationFeature' extends keyof typeof Next ? true : false>;
export type NextNotificationPresentation = Assert<'NotificationPresentation' extends keyof typeof Next ? true : false>;
