import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  StyleSheet: { create: (styles: object) => styles },
}));
vi.mock('../../../keyboard/rendering/keyboard-surface', () => ({
  KeyboardSurface: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock('../../../keyboard/runtime/keyboard-runtime-context', () => ({
  KeyboardRuntimeProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock('../../../screen/rendering/screen-compositor', () => ({
  ScreenCompositor: ({ children }: React.PropsWithChildren) => <>{children}</>,
  ScreenLayerHost: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import { OverlayHost } from './overlay-host.tsx';

describe('OverlayHost', () => {
  it('keeps frame, modal and notification outside application content in presentation order', () => {
    render(
      <OverlayHost frame={<div>frame</div>} modal={<div>modal</div>} notification={<div>notification</div>}>
        <div data-testid="application">
          application
          <div>route layout</div>
        </div>
      </OverlayHost>,
    );

    const application = screen.getByTestId('application');
    const frame = screen.getByText('frame');

    expect(application.contains(frame)).toBe(false);
    expect([...application.parentElement!.parentElement!.children].map((element) => element.textContent)).toEqual([
      'applicationroute layout',
      'frame',
      'modal',
      'notification',
    ]);
  });
});
