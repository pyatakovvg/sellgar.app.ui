import { Platform, type ScrollViewProps } from 'react-native';

export interface KeyboardScrollProps {
  readonly automaticallyAdjustKeyboardInsets: NonNullable<ScrollViewProps['automaticallyAdjustKeyboardInsets']>;
  readonly keyboardDismissMode: NonNullable<ScrollViewProps['keyboardDismissMode']>;
  readonly keyboardShouldPersistTaps: NonNullable<ScrollViewProps['keyboardShouldPersistTaps']>;
}

type KeyboardScrollOverrides = Pick<
  ScrollViewProps,
  'automaticallyAdjustKeyboardInsets' | 'keyboardDismissMode' | 'keyboardShouldPersistTaps'
>;

export const resolveKeyboardScrollProps = (overrides: KeyboardScrollOverrides = {}): KeyboardScrollProps => ({
  automaticallyAdjustKeyboardInsets: overrides.automaticallyAdjustKeyboardInsets ?? false,
  keyboardDismissMode: overrides.keyboardDismissMode ?? (Platform.OS === 'ios' ? 'interactive' : 'on-drag'),
  keyboardShouldPersistTaps: overrides.keyboardShouldPersistTaps ?? 'handled',
});
