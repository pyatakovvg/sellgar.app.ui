import { describe, expect, it } from 'vitest';

import { captureRuntimeFailure, throwRuntimeFailure } from './';

const OUTER_SOURCE = {
  operation: 'load',
  owner: { id: '/terminals', kind: 'route' as const },
  participant: { kind: 'runtime' as const },
};

describe('runtime failure signal', () => {
  it('preserves the original error while retaining the innermost source', () => {
    const error = new Error('Provider failed.');
    const providerSource = {
      operation: 'setup',
      owner: { kind: 'module' as const, token: TestModule },
      participant: { kind: 'provider' as const, token: TestProvider },
    };
    let thrown: unknown;

    try {
      throwRuntimeFailure(error, providerSource);
    } catch (cause) {
      thrown = cause;
    }

    expect(thrown).toBe(error);
    expect(captureRuntimeFailure(thrown, OUTER_SOURCE)).toMatchObject({
      cause: error,
      source: providerSource,
    });
  });

  it('keeps one failure identity when the same error fans out', () => {
    const error = new Error('Singleton provider failed.');
    const source = {
      operation: 'setup',
      owner: { kind: 'application' as const },
      participant: { kind: 'singleton-provider' as const, token: TestProvider },
    };

    try {
      throwRuntimeFailure(error, source);
    } catch {
      // The object itself carries the failure identity through the private WeakMap.
    }

    expect(captureRuntimeFailure(error, OUTER_SOURCE).id).toBe(captureRuntimeFailure(error, OUTER_SOURCE).id);
  });
});

class TestModule {}

class TestProvider {}
