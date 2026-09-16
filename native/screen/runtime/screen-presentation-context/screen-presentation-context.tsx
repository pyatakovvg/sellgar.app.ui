import React from 'react';

import type { ScreenSceneRuntime } from '../screen-runtime';

const ScreenPresentationContext = React.createContext<ScreenSceneRuntime | null>(null);
const ScreenPresentationCommitContext = React.createContext<(scene: ScreenSceneRuntime) => void>(() => undefined);

export const ScreenPresentationProvider = ScreenPresentationContext.Provider;
export const ScreenPresentationCommitProvider = ScreenPresentationCommitContext.Provider;

export const useScreenPresentation = (): ScreenSceneRuntime | null => React.useContext(ScreenPresentationContext);
export const useScreenPresentationCommit = (): ((scene: ScreenSceneRuntime) => void) =>
  React.useContext(ScreenPresentationCommitContext);
