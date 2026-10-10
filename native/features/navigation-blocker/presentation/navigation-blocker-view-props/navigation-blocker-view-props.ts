import type React from 'react';

export interface NavigationBlockerViewProps {
  readonly description?: React.ReactNode;
  readonly inProcess: boolean;
  readonly title?: React.ReactNode;

  leave(): Promise<void>;

  stay(): Promise<void>;
}
