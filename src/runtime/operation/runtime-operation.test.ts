import { describe, expect, it } from 'vitest';

import { createRuntimeRevisionGuard, executeRuntimeOperation, type RuntimeRevisionSource } from './';

const TEST_SOURCE = {
  operation: 'test',
  owner: { kind: 'application' as const },
  participant: { kind: 'runtime' as const },
};

describe('runtime operation', () => {
  it('returns completed result when operation resolves', async () => {
    const result = await executeRuntimeOperation({
      guard: null,
      operation: () => 'ready',
      source: TEST_SOURCE,
    });

    expect(result).toEqual({
      type: 'completed',
      value: 'ready',
    });
  });

  it('returns failed result when operation rejects without lifecycle interruption', async () => {
    const error = new Error('Операция завершилась с ошибкой.');
    const source = new TestRevisionSource();
    const result = await executeRuntimeOperation({
      guard: createRuntimeRevisionGuard(source),
      operation: () => {
        throw error;
      },
      source: TEST_SOURCE,
    });

    expect(result).toMatchObject({
      failure: {
        cause: error,
        source: TEST_SOURCE,
      },
      type: 'failed',
    });
  });

  it('returns interrupted result when revision changes before rejection', async () => {
    const error = new Error('Операция была прервана.');
    const source = new TestRevisionSource();
    const result = await executeRuntimeOperation({
      guard: createRuntimeRevisionGuard(source),
      operation: () => {
        source.bump();
        throw error;
      },
      source: TEST_SOURCE,
    });

    expect(result).toEqual({
      cause: error,
      reason: 'guard-interrupted',
      type: 'interrupted',
    });
  });

  it('returns interrupted result when abort signal is cancelled', async () => {
    const abortController = new AbortController();
    const error = new Error('Операция была отменена пользователем.');
    const result = await executeRuntimeOperation({
      guard: null,
      operation: () => {
        abortController.abort();
        throw error;
      },
      signal: abortController.signal,
      source: TEST_SOURCE,
    });

    expect(result).toEqual({
      cause: error,
      reason: 'guard-interrupted',
      type: 'interrupted',
    });
  });
});

class TestRevisionSource implements RuntimeRevisionSource {
  private currentRevision = 0;

  get revision(): number {
    return this.currentRevision;
  }

  bump(): void {
    this.currentRevision++;
  }
}
