import type * as Next from '../next';

type Assert<TValue extends true> = TValue;
type HasNoRuntimeAccess<TValue> =
  Extract<keyof TValue, 'contextScope' | 'contextFeatures' | 'retainModule'> extends never ? true : false;

export type ApplicationBoundary = Assert<HasNoRuntimeAccess<Next.Application>>;
export type ClientApplicationBoundary = Assert<HasNoRuntimeAccess<NonNullable<ReturnType<typeof Next.useApplication>>>>;
export type ServerApplicationBoundary = Assert<HasNoRuntimeAccess<Awaited<ReturnType<typeof Next.getApplication>>>>;
export type NextFacadeBoundary = Assert<'getApplicationRuntime' extends keyof typeof Next ? false : true>;
