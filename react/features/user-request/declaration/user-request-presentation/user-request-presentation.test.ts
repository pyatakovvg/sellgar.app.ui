import { describe, expect, it } from 'vitest';

import { DisposableRegistry } from '../../../../../core/application/disposable/disposable-registry';
import { UserRequestRuntime } from '../../../../../core/features/user-request/runtime/user-request-runtime';

import { UserRequestPresentationNotConfiguredException } from './user-request-presentation-not-configured.exception.ts';
import { UserRequestPresentation } from './user-request-presentation.ts';

describe('UserRequestPresentation', () => {
  it('resolves each configured semantic request view', () => {
    const AlertView = () => null;
    const ConfirmView = () => null;
    const PromptView = () => null;
    const presentation = UserRequestPresentation.define((registry) => {
      registry.alert(AlertView);
      registry.confirm(ConfirmView);
      registry.prompt(PromptView);
    });

    expect(presentation.resolve('alert')).toBe(AlertView);
    expect(presentation.resolve('confirm')).toBe(ConfirmView);
    expect(presentation.resolve('prompt')).toBe(PromptView);
  });

  it('fails explicitly when the requested kind is not configured', () => {
    const presentation = UserRequestPresentation.define(() => undefined);

    expect(() => presentation.resolve('prompt')).toThrow(new UserRequestPresentationNotConfiguredException('prompt'));
  });

  it('does not resolve the pending request when its view is not configured', async () => {
    const presentation = UserRequestPresentation.define(() => undefined);
    const runtime = new UserRequestRuntime(new DisposableRegistry());
    const result = runtime.open('confirm', { title: 'Pending request' });
    const resolution = result.then(() => 'resolved');

    expect(() => presentation.resolve('confirm')).toThrow(new UserRequestPresentationNotConfiguredException('confirm'));
    await expect(Promise.race([resolution, Promise.resolve('pending')])).resolves.toBe('pending');

    runtime.cancel(runtime.getSnapshot()!.id);

    await expect(result).resolves.toBe(false);
  });
});
