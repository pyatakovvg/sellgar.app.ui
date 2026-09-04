import React from 'react';
import { Keyboard, type EmitterSubscription, type ScrollViewProps } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';

import { KeyboardScrollOwnerProvider } from '../../runtime/keyboard-scroll-context';
import { resolveKeyboardScrollProps } from '../../scroll/keyboard-scroll-props';

export interface KeyboardScrollViewProps extends ScrollViewProps {
  readonly bottomOffset?: number;
  readonly mode?: KeyboardAwareScrollViewProps['mode'];
}

export type KeyboardScrollViewRef = KeyboardAwareScrollViewRef;

export const KeyboardScrollView = React.forwardRef<KeyboardScrollViewRef, KeyboardScrollViewProps>((props, ref) => {
  const { bottomOffset = 40, children, mode = 'insets', ...scrollProps } = props;
  const autoFocusSubscription = React.useRef<EmitterSubscription | null>(null);
  const scrollView = React.useRef<KeyboardScrollViewRef | null>(null);
  const keyboardScrollProps = resolveKeyboardScrollProps(scrollProps);
  const setRef = React.useCallback(
    (value: KeyboardScrollViewRef | null) => {
      scrollView.current = value;

      if (typeof ref === 'function') {
        ref(value);
      } else if (ref) {
        ref.current = value;
      }
    },
    [ref],
  );
  const revealInput = React.useCallback(
    (target: number) => {
      scrollView.current?.scrollResponderScrollNativeHandleToKeyboard(target, bottomOffset, true);
    },
    [bottomOffset],
  );
  const scrollOwner = React.useMemo(
    () => ({
      revealAutoFocus: (target: number) => {
        autoFocusSubscription.current?.remove();

        if (Keyboard.isVisible()) {
          revealInput(target);

          return NOOP;
        }

        const subscription = Keyboard.addListener('keyboardDidShow', () => {
          subscription.remove();
          if (autoFocusSubscription.current === subscription) autoFocusSubscription.current = null;
          revealInput(target);
        });

        autoFocusSubscription.current = subscription;

        return () => {
          subscription.remove();
          if (autoFocusSubscription.current === subscription) autoFocusSubscription.current = null;
        };
      },
    }),
    [revealInput],
  );

  React.useEffect(() => {
    return () => autoFocusSubscription.current?.remove();
  }, []);

  return (
    <KeyboardScrollOwnerProvider value={scrollOwner}>
      <KeyboardAwareScrollView
        {...scrollProps}
        {...keyboardScrollProps}
        bottomOffset={bottomOffset}
        disableScrollOnKeyboardHide
        mode={mode}
        ref={setRef}
      >
        {children}
      </KeyboardAwareScrollView>
    </KeyboardScrollOwnerProvider>
  );
});

KeyboardScrollView.displayName = 'KeyboardScrollView';

const NOOP = (): void => undefined;
