import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { Payload, getFsmPayload } from './payload.decorator';

class Input {
  readonly value: string;
}

class WithPayload {
  @Payload(Input)
  readonly payload: Input;
}

describe('FSM payload declaration', () => {
  it('registers the model without requiring declare or an initialized payload', () => {
    const command = new WithPayload();
    expect(getFsmPayload(WithPayload)).toBe(Input);
    expect(Object.hasOwn(command, 'payload')).toBe(true);
    expect(command.payload).toBeUndefined();
    expect(validateSync(command, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect(JSON.stringify(command)).toBe('{}');
  });

  it('does not assign incoming snapshot data to the outgoing payload declaration', () => {
    const descriptor = plainToInstance(WithPayload, { payload: { value: 'incoming' } });
    expect(validateSync(descriptor, { whitelist: true, forbidNonWhitelisted: true })).not.toEqual([]);
  });

  it('keeps a command without payload independent of other declarations', () => {
    class WithoutPayload {}
    expect(getFsmPayload(WithoutPayload)).toBeUndefined();
  });

  it('rejects a payload declaration on another property', () => {
    expect(() => Reflect.apply(Payload(Input), undefined, [{}, 'other'])).toThrow('поле payload');
  });
});
