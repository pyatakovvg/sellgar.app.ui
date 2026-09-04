import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
    expect([...application.parentElement!.children].map((element) => element.textContent)).toEqual([
      'applicationroute layout',
      'frame',
      'modal',
      'notification',
    ]);
  });
});
