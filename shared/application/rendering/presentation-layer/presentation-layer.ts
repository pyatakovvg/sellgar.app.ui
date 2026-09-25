export const PresentationLayer = Object.freeze({
  Application: 'application',
  Frame: 'frame',
  Modal: 'modal',
  Notification: 'notification',
} as const);

export type PresentationLayerValue = (typeof PresentationLayer)[keyof typeof PresentationLayer];
