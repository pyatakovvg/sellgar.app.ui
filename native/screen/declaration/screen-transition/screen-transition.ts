import type { ScreenAnimation } from '../screen-animation';

export type ScreenTransitionOperation = 'dismiss' | 'present';

export interface ScreenTransition {
  readonly animation: ScreenAnimation;
  readonly operation: ScreenTransitionOperation;
}
