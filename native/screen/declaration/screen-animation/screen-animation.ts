export const ScreenAnimation = Object.freeze({
  Fade: 'fade',
  SlideFromBottom: 'slide-from-bottom',
  SlideFromLeft: 'slide-from-left',
  SlideFromRight: 'slide-from-right',
} as const);

export type ScreenAnimation = (typeof ScreenAnimation)[keyof typeof ScreenAnimation];
