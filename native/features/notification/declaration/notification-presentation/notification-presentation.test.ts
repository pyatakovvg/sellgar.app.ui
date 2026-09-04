import { describe, expect, it } from 'vitest';

import { NotificationPresentationNotConfiguredException } from './notification-presentation-not-configured.exception.ts';
import { NotificationPresentation } from './notification-presentation.ts';

describe('Native NotificationPresentation', () => {
  it('resolves the configured semantic status view', () => {
    const InfoView = () => null;
    const presentation = NotificationPresentation.define((registry) => registry.info(InfoView));

    expect(presentation.resolve('info')).toBe(InfoView);
  });

  it('fails explicitly when the requested status is not configured', () => {
    const presentation = NotificationPresentation.define(() => undefined);

    expect(() => presentation.resolve('destructive')).toThrow(
      new NotificationPresentationNotConfiguredException('destructive'),
    );
  });
});
