import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScreenCompositor, ScreenLayerHost } from './screen-compositor.tsx';
import { useScreenActive } from '../../runtime/screen-activity-context';

vi.mock('react-native', () => ({
  View: ({ children, pointerEvents }: React.PropsWithChildren<{ pointerEvents?: string }>) => (
    <div data-pointer={pointerEvents}>{children}</div>
  ),
  StyleSheet: { create: (styles: object) => styles },
  TextInput: { State: { currentlyFocusedInput: () => null } },
}));
afterEach(cleanup);
const Content = ({ id }: { id: string }) => (
  <button data-testid={id} data-active={String(useScreenActive())}>
    {id}
  </button>
);
const blocked = (id: string) =>
  screen.getByTestId(id).closest('[data-pointer="none"], [data-pointer="box-only"]') !== null;
const FrameTree = ({ nested, modal = false }: { nested: boolean; modal?: boolean }) => (
  <ScreenCompositor>
    <ScreenLayerHost kind="application">
      <Content id="application" />
    </ScreenLayerHost>
    <ScreenLayerHost kind="frame" depth={0}>
      <Content id="outer" />
      {nested && (
        <ScreenLayerHost kind="frame" depth={1}>
          <Content id="inner" />
        </ScreenLayerHost>
      )}
    </ScreenLayerHost>
    {modal && (
      <ScreenLayerHost kind="modal">
        <Content id="modal" />
      </ScreenLayerHost>
    )}
  </ScreenCompositor>
);

describe('ScreenCompositor touch projection', () => {
  it('keeps nested compositors independent', () => {
    render(
      <ScreenCompositor>
        <ScreenLayerHost kind="application">
          <Content id="owner" />
          <ScreenCompositor>
            <ScreenLayerHost kind="frame">
              <Content id="independent" />
            </ScreenLayerHost>
          </ScreenCompositor>
        </ScreenLayerHost>
      </ScreenCompositor>,
    );
    expect(screen.getByTestId('owner').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('independent').getAttribute('data-active')).toBe('true');
    expect(blocked('independent')).toBe(false);
  });

  it('keeps a nested active frame reachable through its inactive ancestor', () => {
    render(
      <React.StrictMode>
        <FrameTree nested />
      </React.StrictMode>,
    );
    expect(screen.getByTestId('outer').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('inner').getAttribute('data-active')).toBe('true');
    expect(blocked('application')).toBe(true);
    expect(blocked('inner')).toBe(false);
  });
  it('restores the parent frame after the nested frame is closed', () => {
    const view = render(<FrameTree nested />);
    view.rerender(<FrameTree nested={false} />);
    expect(blocked('application')).toBe(true);
    expect(blocked('outer')).toBe(false);
    expect(screen.getByTestId('outer').getAttribute('data-active')).toBe('true');
  });
  it('keeps the modal above both nested frame layers', () => {
    render(<FrameTree nested modal />);
    expect(blocked('application')).toBe(true);
    expect(blocked('outer')).toBe(true);
    expect(blocked('inner')).toBe(true);
    expect(screen.getByTestId('modal').getAttribute('data-active')).toBe('true');
  });
  it('blocks an unrelated frame while the deepest frame is active', () => {
    render(
      <ScreenCompositor>
        <ScreenLayerHost kind="frame" depth={0}>
          <Content id="unrelated" />
        </ScreenLayerHost>
        <ScreenLayerHost kind="frame" depth={1}>
          <ScreenLayerHost kind="frame" depth={2}>
            <Content id="deep" />
          </ScreenLayerHost>
        </ScreenLayerHost>
      </ScreenCompositor>,
    );
    expect(blocked('unrelated')).toBe(true);
    expect(blocked('deep')).toBe(false);
  });
});
