import React from 'react';
import { type ScrollViewProps } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';

import { resolveKeyboardScrollProps } from '../../scroll/keyboard-scroll-props';

export interface KeyboardScrollViewProps extends ScrollViewProps {
  readonly bottomOffset?: number;
  readonly enabled?: KeyboardAwareScrollViewProps['enabled'];
  readonly mode?: KeyboardAwareScrollViewProps['mode'];
  readonly ScrollViewComponent?: KeyboardAwareScrollViewProps['ScrollViewComponent'];
}

export type KeyboardScrollViewRef = KeyboardAwareScrollViewRef;

export const KeyboardScrollView = React.forwardRef<KeyboardScrollViewRef, KeyboardScrollViewProps>((props, ref) => {
  const { bottomOffset = 40, children, enabled = true, mode = 'insets', ...scrollProps } = props;
  const keyboardScrollProps = resolveKeyboardScrollProps(scrollProps);

  return (
    <KeyboardAwareScrollView
      {...scrollProps}
      {...keyboardScrollProps}
      bottomOffset={bottomOffset}
      disableScrollOnKeyboardHide
      enabled={enabled}
      mode={mode}
      ref={ref}
    >
      {children}
    </KeyboardAwareScrollView>
  );
});

KeyboardScrollView.displayName = 'KeyboardScrollView';
