import React from 'react';

import type { FrameSourceCloseHandler } from '../../source/frame-source';

export interface FrameContextValue {
  readonly back: () => Promise<void>;
  readonly close: () => Promise<void>;
  readonly hasParent: boolean;
  readonly open: boolean;
}

export interface FrameContextProviderProps {
  readonly children: React.ReactNode;
  readonly back: FrameSourceCloseHandler;
  readonly close: FrameSourceCloseHandler;
  readonly hasParent: boolean;
  readonly open: boolean;
}

export const FrameContext = React.createContext<FrameContextValue | null>(null);

export const FrameContextProvider: React.FC<FrameContextProviderProps> = ({
  back,
  children,
  close,
  hasParent,
  open,
}) => {
  const value = React.useMemo<FrameContextValue>(
    () => ({
      back: () => {
        return Promise.resolve(back());
      },
      close: () => {
        return Promise.resolve(close());
      },
      hasParent,
      open,
    }),
    [back, close, hasParent, open],
  );

  return <FrameContext.Provider value={value}>{children}</FrameContext.Provider>;
};

export const useFrameContextOrNull = (): FrameContextValue | null => {
  return React.useContext(FrameContext);
};
