import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ScreenActivityProvider } from '../../runtime/screen-activity-context';
import { ScreenCompositorRuntime, type ScreenLayerKind } from '../../runtime/screen-compositor-runtime';

const ScreenCompositorContext = React.createContext<ScreenCompositorRuntime | null>(null);

export const ScreenCompositor: React.FC<React.PropsWithChildren> = (props) => {
  const runtime = React.useRef<ScreenCompositorRuntime>(null);

  if (runtime.current === null) runtime.current = new ScreenCompositorRuntime();

  return <ScreenCompositorContext.Provider value={runtime.current}>{props.children}</ScreenCompositorContext.Provider>;
};

interface ScreenLayerHostProps extends React.PropsWithChildren {
  readonly depth?: number;
  readonly kind: ScreenLayerKind;
}

export const ScreenLayerHost: React.FC<ScreenLayerHostProps> = ({ children, depth = 0, kind }) => {
  const compositor = React.useContext(ScreenCompositorContext);
  const identity = React.useRef(Symbol(kind)).current;

  React.useLayoutEffect(() => {
    return compositor?.register(identity, kind, depth);
  }, [compositor, depth, identity, kind]);

  const subscribe = React.useCallback(
    (listener: () => void) => compositor?.subscribe(listener) ?? EMPTY_UNSUBSCRIBE,
    [compositor],
  );
  const getActive = React.useCallback(() => compositor?.isActive(identity) ?? true, [compositor, identity]);
  const active = React.useSyncExternalStore(subscribe, getActive, getActive);
  const content = <ScreenActivityProvider active={active}>{children}</ScreenActivityProvider>;

  if (kind === 'modal') return content;

  return (
    <View pointerEvents={active ? 'box-none' : 'none'} style={styles.layer}>
      {content}
    </View>
  );
};

const EMPTY_UNSUBSCRIBE = () => undefined;

const styles = StyleSheet.create({
  layer: {
    flex: 1,
  },
});
