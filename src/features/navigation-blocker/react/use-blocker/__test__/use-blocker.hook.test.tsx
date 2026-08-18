import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useBlocker } from '../use-blocker.hook.ts';

const blocker = vi.hoisted(() => ({
  dispose: vi.fn(),
  register: vi.fn(),
}));

vi.mock('../../../../../runtime/react', () => ({
  useDependency: () => blocker,
}));

describe('useBlocker', () => {
  beforeEach(() => {
    blocker.dispose.mockReset();
    blocker.register.mockReset();
    blocker.register.mockReturnValue({ dispose: blocker.dispose });
  });

  it('uses the latest condition without re-registering and disposes on unmount', () => {
    const { rerender, unmount } = render(<Probe condition={true} />);
    const condition = blocker.register.mock.calls[0]?.[0] as (() => boolean) | undefined;

    expect(blocker.register).toHaveBeenCalledOnce();
    expect(condition?.()).toBe(true);

    rerender(<Probe condition={false} />);

    expect(blocker.register).toHaveBeenCalledOnce();
    expect(condition?.()).toBe(false);

    unmount();

    expect(blocker.dispose).toHaveBeenCalledOnce();
  });
});

const Probe = (props: { readonly condition: boolean }) => {
  useBlocker(props.condition);

  return null;
};
