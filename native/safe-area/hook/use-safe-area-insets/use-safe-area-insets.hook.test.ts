import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSafeAreaInsets } from './use-safe-area-insets.hook';

const { useNativeSafeAreaInsets } = vi.hoisted(() => ({
  useNativeSafeAreaInsets: vi.fn(),
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: useNativeSafeAreaInsets,
}));

describe('useSafeAreaInsets', () => {
  beforeEach(() => {
    useNativeSafeAreaInsets.mockReset();
  });

  it('exposes the native safe-area measurements without applying layout', () => {
    useNativeSafeAreaInsets.mockReturnValue({
      top: 48,
      right: 0,
      bottom: 24,
      left: 0,
    });

    const { result } = renderHook(() => useSafeAreaInsets());

    expect(result.current).toEqual({
      top: 48,
      right: 0,
      bottom: 24,
      left: 0,
    });
  });
});
