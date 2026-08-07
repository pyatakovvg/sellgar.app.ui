import { describe, expect, it } from 'vitest';

import { ConflictException, HttpException, isHttpException } from './';

describe('HttpException', () => {
  it('preserves transport and application error context', () => {
    const cause = new Error('transport');
    const response = { title: 'Terminal state conflict', traceId: 'trace-1' };
    const error = new ConflictException(response, {
      cause,
      request: { method: 'POST', url: '/terminals/1/actions' },
    });

    expect(error).toBeInstanceOf(HttpException);
    expect(error.name).toBe('ConflictException');
    expect(error.message).toBe(response.title);
    expect(error.status).toBe(409);
    expect(error.response).toBe(response);
    expect(error.cause).toBe(cause);
    expect(error.request).toEqual({ method: 'POST', url: '/terminals/1/actions' });
    expect(isHttpException(error)).toBe(true);
  });

  it('supports declarative custom status exceptions without registration', () => {
    class TerminalConflictException extends ConflictException<{ readonly terminalId: string }> {}

    const error = new TerminalConflictException({ terminalId: 'terminal-1' });

    expect(error.name).toBe('TerminalConflictException');
    expect(error.status).toBe(409);
    expect(error.response.terminalId).toBe('terminal-1');
  });
});
