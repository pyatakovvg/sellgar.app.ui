import type React from 'react';

import type { ScreenTransition } from '../screen-transition';

export interface ScreenPresentation {
  readonly content: React.ReactNode;
  readonly key: string;
  readonly transition?: ScreenTransition;
}
