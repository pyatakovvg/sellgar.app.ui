import { describe, expect, it } from 'vitest';

import { ConflictException } from '../../http';
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

  it('returns rejected for an expected HTTP client result without creating RuntimeFailure', async () => {
    const error = new ConflictException({ title: 'Conflict' });
    const result = await executeRuntimeOperation({
      guard: null,
      operation: () => Promise.reject(error),
      source: TEST_SOURCE,
    });

    expect(result).toEqual({
      error,
      source: TEST_SOURCE,
      type: 'rejected',
    });
    expect('failure' in result).toBe(false);
  });

  it('interrupts a resolved operation when its revision changed before commit', async () => {
    const source = new TestRevisionSource();
    const result = await executeRuntimeOperation({
      guard: createRuntimeRevisionGuard(source),
      operation: () => {
        source.bump();
        return 'stale';
      },
      source: TEST_SOURCE,
    });

    expect(result).toEqual({
      cause: undefined,
      reason: 'guard-interrupted',
      type: 'interrupted',
    });
  });

  it('interrupts a still-pending operation as soon as its revision changes', async () => {
    const source = new TestRevisionSource();
    const resultPromise = executeRuntimeOperation({
      guard: createRuntimeRevisionGuard(source),
      operation: () => new Promise<never>(() => {}),
      source: TEST_SOURCE,
    });

    source.bump();

    await expect(resultPromise).resolves.toEqual({
      cause: undefined,
      reason: 'guard-interrupted',
      type: 'interrupted',
    });
  });
});

class TestRevisionSource implements RuntimeRevisionSource {
  private currentRevision = 0;
  private readonly listeners = new Set<() => void>();

  get revision(): number {
    return this.currentRevision;
  }

  bump(): void {
    this.currentRevision++;

    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }
}
