import type { DependencyConstructor } from '../../../di/binding/binding-builder/index.ts';

export interface ApplicationFeatureInitializeContextInterface {
  readonly signal: AbortSignal;
}

export type ApplicationFeatureCleanup = () => void | Promise<void>;
export type ApplicationFeatureResult = void | ApplicationFeatureCleanup;

export interface ApplicationFeatureInterface {
  initialize?(
    context: ApplicationFeatureInitializeContextInterface,
  ): ApplicationFeatureResult | Promise<ApplicationFeatureResult>;

  dispose?(): void | Promise<void>;
}

export type ApplicationFeatureToken = DependencyConstructor<ApplicationFeatureInterface>;
