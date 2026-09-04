import React from 'react';
import { RefreshControl, StyleSheet, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import type { RouteActivationRuntime } from '../../../../core/router/runtime/route-runtime';
import { KeyboardScrollView } from '../../../keyboard/rendering/keyboard-scroll-view';
import { useKeyboardRuntime } from '../../../keyboard/runtime/keyboard-runtime-context';
import type { ModuleMetadata } from '../../declaration/module';

interface ModuleRefreshPresentationProps {
  readonly children: React.ReactNode;
  readonly runtime: RouteActivationRuntime<ModuleMetadata>;
}

export const ModuleRefreshPresentation: React.FC<ModuleRefreshPresentationProps> = (props) => {
  const keyboard = useKeyboardRuntime();
  const keyboardDragActive = React.useRef(false);
  const [refreshAtTop, setRefreshAtTop] = React.useState(true);
  const [draggingWithKeyboard, setDraggingWithKeyboard] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const updateRefreshAtTop = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setRefreshAtTop(event.nativeEvent.contentOffset.y <= 0);
  }, []);
  const handleScrollBeginDrag = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      keyboardDragActive.current = keyboard.visible;
      setDraggingWithKeyboard(keyboard.visible);
      updateRefreshAtTop(event);
    },
    [keyboard.visible, updateRefreshAtTop],
  );
  const handleScrollEnd = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      updateRefreshAtTop(event);

      if (!keyboardDragActive.current) return;

      keyboardDragActive.current = false;
      setDraggingWithKeyboard(false);
    },
    [updateRefreshAtTop],
  );
  const handleRefresh = React.useCallback(async () => {
    if (keyboard.visible || keyboardDragActive.current) {
      keyboard.dismiss();
      return;
    }

    setRefreshing(true);

    try {
      await props.runtime.revalidate();
    } finally {
      setRefreshing(false);
    }
  }, [keyboard, props.runtime]);
  const refreshEnabled = refreshAtTop && !keyboard.visible && !draggingWithKeyboard;

  return (
    <KeyboardScrollView
      contentContainerStyle={styles.content}
      mode="insets"
      onMomentumScrollEnd={handleScrollEnd}
      onScrollBeginDrag={handleScrollBeginDrag}
      onScrollEndDrag={handleScrollEnd}
      refreshControl={
        <RefreshControl enabled={refreshEnabled} onRefresh={() => void handleRefresh()} refreshing={refreshing} />
      }
      style={styles.root}
    >
      {props.children}
    </KeyboardScrollView>
  );
};

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  root: {
    flex: 1,
  },
});
