import type { ServiceIdentifier } from 'inversify';

export type AbstractDependencyConstructor<TValue> = abstract new (...args: any[]) => TValue;

export type DependencyToken<TValue> = ServiceIdentifier<TValue> | AbstractDependencyConstructor<TValue>;
