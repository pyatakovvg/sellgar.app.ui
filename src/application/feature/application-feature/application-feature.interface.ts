import type React from 'react';

export abstract class ApplicationFeatureInterface {
  abstract createLayer(): React.ReactNode;
}
