import { injectFromBase } from 'inversify';

import type { DependencyConstructor } from '../../../../di/binding/binding-builder';
import { Injectable } from '../../../../di/injection/decorators';

export type MetricPayload = Readonly<Record<string, unknown>>;

export interface MetricInitializeContext {
  readonly signal: AbortSignal;
}

export interface MetricInterface {
  initialize?(context: MetricInitializeContext): void | Promise<void>;
  track(name: string, payload: MetricPayload): void | Promise<void>;
  dispose?(): void | Promise<void>;
}

export type MetricToken = DependencyConstructor<MetricInterface>;

export interface MetricOptions {
  /** Original metric token when a configure method returns a separate declaration. */
  readonly token?: MetricToken;
  /** Disable when a subclass supplies its own constructor instead of forwarding base dependencies. */
  readonly inheritConstructorArguments?: boolean;
}

const METRIC_METADATA = Symbol('tiyn-app:metric');

export const Metric = (options: MetricOptions = {}) => {
  return <TConstructor extends MetricToken>(constructor: TConstructor): void => {
    Injectable()(constructor);
    if (getMetricToken(Object.getPrototypeOf(constructor))) {
      injectFromBase({
        extendConstructorArguments: options.inheritConstructorArguments ?? true,
        extendProperties: true,
        lifecycle: { extendPostConstructMethods: false, extendPreDestroyMethods: false },
      })(constructor);
    }
    const inherited = Reflect.getMetadata(METRIC_METADATA, constructor) as MetricToken | undefined;
    Reflect.defineMetadata(METRIC_METADATA, options.token ?? inherited ?? constructor, constructor);
  };
};

export const getMetricToken = (declaration: unknown): MetricToken | undefined => {
  return typeof declaration === 'function'
    ? (Reflect.getOwnMetadata(METRIC_METADATA, declaration) as MetricToken | undefined)
    : undefined;
};
