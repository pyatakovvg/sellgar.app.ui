import type React from 'react';

export interface ApplicationFeatureOptions {
  readonly wrapper?: React.ComponentType<React.PropsWithChildren>;
  readonly presentation?: {
    readonly layer: 'application' | 'modal' | 'notification';
    readonly view: React.ReactNode;
  };
}
