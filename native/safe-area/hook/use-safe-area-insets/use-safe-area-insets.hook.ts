import { useSafeAreaInsets as useNativeSafeAreaInsets } from 'react-native-safe-area-context';

export interface SafeAreaInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const useSafeAreaInsets = (): SafeAreaInsets => useNativeSafeAreaInsets();
