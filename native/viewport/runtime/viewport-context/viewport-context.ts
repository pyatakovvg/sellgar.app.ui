import React from 'react';

export interface ViewportScrollOptions {
  readonly animated?: boolean;
}

export interface ViewportController {
  scrollToStart(options?: ViewportScrollOptions): void;
}

export const ViewportContext = React.createContext<ViewportController | null>(null);

export const useViewport = (): ViewportController => {
  const viewport = React.useContext(ViewportContext);

  if (!viewport) {
    throw new Error('Viewport API доступен только внутри <Viewport>.');
  }

  return viewport;
};
