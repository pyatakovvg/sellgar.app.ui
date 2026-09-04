import { describe, expect, it } from 'vitest';

import { NetworkError, TransportTimeoutError } from './transport-error.ts';

describe('Transport errors', () => {
  it.each([NetworkError, TransportTimeoutError])('preserves transport context for %s', (ErrorConstructor) => {
    const cause = new Error('transport');
    const request = { method: 'GET', url: '/profile' };
    const error = new ErrorConstructor('Transport failed.', { cause, request });

    expect(error.name).toBe(ErrorConstructor.name);
    expect(error.message).toBe('Transport failed.');
    expect(error.cause).toBe(cause);
    expect(error.request).toBe(request);
  });
});
