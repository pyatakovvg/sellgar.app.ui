import React from 'react';
import { type ScrollViewProps } from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardController,
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
  const scrollView = React.useRef<KeyboardScrollViewRef | null>(null);
  const wasEnabled = React.useRef(enabled);
  const keyboardScrollProps = resolveKeyboardScrollProps(scrollProps);
  const setRef = React.useCallback(
    (value: KeyboardScrollViewRef | null) => {
      scrollView.current = value;

      if (typeof ref === 'function') ref(value);
      else if (ref) ref.current = value;
    },
    [ref],
  );

  React.useEffect(() => {
    const activated = enabled && !wasEnabled.current;

    wasEnabled.current = enabled;

    if (activated && KeyboardController.isVisible()) scrollView.current?.assureFocusedInputVisible();
  }, [enabled]);

  return (
    <KeyboardAwareScrollView
      {...scrollProps}
      {...keyboardScrollProps}
      bottomOffset={bottomOffset}
      disableScrollOnKeyboardHide
      enabled={enabled}
      mode={mode}
      ref={setRef}
    >
      {children}
    </KeyboardAwareScrollView>
  );
});

KeyboardScrollView.displayName = 'KeyboardScrollView';
