import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OverlayHost } from './overlay-host.tsx';

describe('OverlayHost', () => {
  it('creates stable body siblings in frame, modal and notification order', async () => {
    const view = render(
      <OverlayHost
        frame={<div>frame content</div>}
        modal={<div>modal content</div>}
        notification={<div>notification content</div>}
      >
        <div>application content</div>
      </OverlayHost>,
    );

    expect(screen.getByText('application content')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('notification content')).toBeInTheDocument());

    const layers = [...document.body.querySelectorAll<HTMLElement>('[data-tiyn-overlay-layer]')];

    expect(layers.map((layer) => layer.dataset['tiynOverlayLayer'])).toEqual(['frame', 'modal', 'notification']);
    expect(layers.every((layer) => layer.parentElement === document.body)).toBe(true);

    view.unmount();

    expect(document.body.querySelectorAll('[data-tiyn-overlay-layer]')).toHaveLength(0);
  });
});
