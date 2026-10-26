import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ScreenActivityProvider } from '../../runtime/screen-activity-context';
import {
  ScreenCompositorRuntime,
  type ScreenLayerKind,
  type ScreenLayerSnapshot,
} from '../../runtime/screen-compositor-runtime';

const ScreenCompositorContext = React.createContext<ScreenCompositorRuntime | null>(null);
const ScreenLayerParentContext = React.createContext<symbol | null>(null);

export const ScreenCompositor: React.FC<React.PropsWithChildren> = (props) => {
  const runtime = React.useRef<ScreenCompositorRuntime>(null);

  if (runtime.current === null) runtime.current = new ScreenCompositorRuntime();

  return (
    <ScreenCompositorContext.Provider value={runtime.current}>
      <ScreenLayerParentContext.Provider value={null}>{props.children}</ScreenLayerParentContext.Provider>
    </ScreenCompositorContext.Provider>
  );
};

interface ScreenLayerHostProps extends React.PropsWithChildren {
  readonly depth?: number;
  readonly kind: ScreenLayerKind;
}

export const ScreenLayerHost: React.FC<ScreenLayerHostProps> = ({ children, depth = 0, kind }) => {
  const compositor = React.useContext(ScreenCompositorContext);
  const parent = React.useContext(ScreenLayerParentContext);
  const identity = React.useRef(Symbol(kind)).current;

  React.useLayoutEffect(() => {
    return compositor?.register(identity, kind, depth, parent);
  }, [compositor, depth, identity, kind, parent]);

  const subscribe = React.useCallback(
    (listener: () => void) => compositor?.subscribe(listener) ?? EMPTY_UNSUBSCRIBE,
    [compositor],
  );
  const getSnapshot = React.useCallback(
    () => compositor?.getLayerSnapshot(identity) ?? STANDALONE_LAYER,
    [compositor, identity],
  );
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const content = (
    <ScreenLayerParentContext.Provider value={identity}>
      <ScreenActivityProvider active={snapshot.active}>{children}</ScreenActivityProvider>
    </ScreenLayerParentContext.Provider>
  );

  if (kind === 'modal') return content;

  return (
    <View pointerEvents={snapshot.canReceiveTouches ? 'box-none' : 'none'} style={styles.layer}>
      {content}
    </View>
  );
};

const EMPTY_UNSUBSCRIBE = () => undefined;
const STANDALONE_LAYER: ScreenLayerSnapshot = Object.freeze({ active: true, canReceiveTouches: true });

const styles = StyleSheet.create({
  layer: {
    flex: 1,
  },
});
