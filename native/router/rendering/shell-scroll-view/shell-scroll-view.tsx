import React from 'react';
import { ScrollView as ReactNativeScrollView, StyleSheet, type ScrollViewProps } from 'react-native';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import { useAnimatedRef, useScrollOffset } from 'react-native-reanimated';

import {
  KeyboardScrollView,
  type KeyboardScrollViewProps,
  type KeyboardScrollViewRef,
} from '../../../keyboard/rendering/keyboard-scroll-view';
import { resolveKeyboardScrollProps } from '../../../keyboard/scroll/keyboard-scroll-props';
import { useShellRuntime } from '../../runtime/shell-runtime-context';

export type ShellScrollViewProps = KeyboardScrollViewProps;

export const ShellScrollView = React.forwardRef<KeyboardScrollViewRef, ShellScrollViewProps>((props, ref) => {
  const keyboardScrollProps = resolveKeyboardScrollProps(props);

  return (
    <KeyboardScrollView
      {...props}
      {...keyboardScrollProps}
      ScrollViewComponent={ShellGestureScrollView as KeyboardScrollViewProps['ScrollViewComponent']}
      bounces={props.bounces ?? false}
      nestedScrollEnabled={props.nestedScrollEnabled ?? true}
      overScrollMode={props.overScrollMode ?? 'never'}
      ref={ref}
      scrollEventThrottle={props.scrollEventThrottle ?? 16}
      style={[styles.root, props.style]}
    />
  );
});

ShellScrollView.displayName = 'ShellScrollView';

const ShellGestureScrollView = React.forwardRef<React.ComponentRef<typeof ReactNativeScrollView>, ScrollViewProps>(
  (props, ref) => {
    const runtime = useShellRuntime();
    const gestureRelations: Pick<React.ComponentProps<typeof GestureScrollView>, 'simultaneousWith'> = {
      simultaneousWith: runtime.dismissGesture,
    };
    const scrollRef = useAnimatedRef<React.ComponentRef<typeof ReactNativeScrollView>>();

    useScrollOffset(scrollRef, runtime.scrollOffset);

    const setScrollRef = React.useCallback(
      (value: React.ComponentRef<typeof ReactNativeScrollView> | null) => {
        scrollRef(value);

        if (typeof ref === 'function') ref(value);
        else if (ref) ref.current = value;
      },
      [ref, scrollRef],
    );
    const handleLayout = React.useCallback(
      (event: Parameters<NonNullable<ScrollViewProps['onLayout']>>[0]) => {
        props.onLayout?.(event);
        scrollRef.current?.getNativeScrollRef()?.measureInWindow((_x, y, _width, height) => {
          runtime.scrollBounds.value = { bottom: y + height, top: y };
        });
      },
      [props.onLayout, runtime.scrollBounds],
    );

    React.useEffect(() => {
      return () => {
        runtime.scrollBounds.value = null;
        runtime.scrollOffset.value = 0;
      };
    }, [runtime.scrollBounds, runtime.scrollOffset]);

    return <GestureScrollView {...props} {...gestureRelations} onLayout={handleLayout} ref={setScrollRef} />;
  },
);

ShellGestureScrollView.displayName = 'ShellGestureScrollView';

const styles = StyleSheet.create({
  root: {
    flexShrink: 1,
  },
});
