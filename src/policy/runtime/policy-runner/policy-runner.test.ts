import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import type { ApplicationControllerInterface } from '../../../application/lifecycle/application-lifecycle';
import type { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import type { DependencyToken } from '../../../di/token/dependency-token';
import type { RuntimeContextInterface } from '../../../runtime/context';
import type { RuntimeScope } from '../../../runtime/scope/base';
import { ApplicationScope } from '../../../runtime/scope/kind';
import { PolicyDescriptorBuilder } from '../../declaration/policy-descriptor-builder';
import { Policy, PolicyInterface } from '../../contract/policy';
import {
  PolicyResultHandlerInterface,
  type PolicyResultHandlerContextInterface,
} from '../../contract/policy-result-handler';
import type { PolicyBoundaryDecision } from '../../contract/policy-boundary-decision';
import type { PolicyResult } from '../../contract/policy-result';

import { PolicyRunner } from './';

describe('PolicyRunner', () => {
  it('continues when every policy passes', async () => {
    const fixture = createFixture();
    const firstPolicy = fixture.registerPolicy(FirstPolicy, {
      type: 'pass',
    });
    const secondPolicy = fixture.registerPolicy(SecondPolicy, {
      type: 'pass',
    });

    const decision = await fixture.runner.execute([FirstPolicy, SecondPolicy], fixture.context);

    expect(decision).toEqual({ type: 'continue' });
    expect(firstPolicy.executeMock).toHaveBeenCalledWith(fixture.context);
    expect(secondPolicy.executeMock).toHaveBeenCalledWith(fixture.context);
  });

  it('tests policies without running fail handlers', async () => {
    const fixture = createFixture();
    const firstPolicy = fixture.registerPolicy(FirstPolicy, {
      type: 'fail',
      reason: 'denied',
    });

    fixture.registerHandler(FirstHandler, {
      to: '/sign-in',
      type: 'redirect',
    });

    const result = await fixture.runner.test(
      [
        new PolicyDescriptorBuilder({
          onFail: FirstHandler,
          use: FirstPolicy,
        }),
      ],
      fixture.context,
    );

    expect(result).toBe(false);
    expect(firstPolicy.executeMock).toHaveBeenCalledWith(fixture.context);
  });

  it('tests policies as allowed when every policy passes', async () => {
    const fixture = createFixture();

    fixture.registerPolicy(FirstPolicy, { type: 'pass' });
    fixture.registerPolicy(SecondPolicy, { type: 'pass' });

    await expect(fixture.runner.test([FirstPolicy, SecondPolicy], fixture.context)).resolves.toBe(true);
  });

  it('returns forbidden when a policy fails without handler', async () => {
    const fixture = createFixture();

    fixture.registerPolicy(FirstPolicy, {
      type: 'fail',
      reason: 'denied',
    });

    await expect(fixture.runner.execute([FirstPolicy], fixture.context)).resolves.toEqual({ type: 'forbidden' });
  });

  it('uses onFail decision and continues chain when handler continues', async () => {
    const fixture = createFixture();
    const secondPolicy = fixture.registerPolicy(SecondPolicy, {
      type: 'pass',
    });

    fixture.registerPolicy(FirstPolicy, {
      type: 'fail',
      reason: 'soft-denied',
    });

    const decision = await fixture.runner.execute(
      [
        new PolicyDescriptorBuilder({
          onFail: { type: 'continue' },
          use: FirstPolicy,
        }),
        SecondPolicy,
      ],
      fixture.context,
    );

    expect(decision).toEqual({ type: 'continue' });
    expect(secondPolicy.executeMock).toHaveBeenCalledTimes(1);
  });

  it('uses onPass handler decision', async () => {
    const fixture = createFixture();

    fixture.registerPolicy(FirstPolicy, { type: 'pass' });
    fixture.registerHandler(FirstHandler, {
      to: '/home',
      type: 'redirect',
    });

    const decision = await fixture.runner.execute(
      [
        new PolicyDescriptorBuilder({
          onPass: FirstHandler,
          use: FirstPolicy,
        }),
      ],
      fixture.context,
    );

    expect(decision).toEqual({
      to: '/home',
      type: 'redirect',
    });
  });

  it('passes descriptor, policy result and runtime context to handlers', async () => {
    const fixture = createFixture();
    const policyResult: PolicyResult = {
      data: 'reason-data',
      reason: 'denied',
      type: 'fail',
    };
    const options = {
      requiredRole: 'admin',
    };

    fixture.registerPolicy(FirstPolicy, policyResult);
    const handler = fixture.registerHandler(FirstHandler, {
      type: 'forbidden',
    });

    await fixture.runner.execute(
      [
        new PolicyDescriptorBuilder({
          onFail: FirstHandler,
          options,
          use: FirstPolicy,
        }),
      ],
      fixture.context,
    );

    expect(handler.executeMock).toHaveBeenCalledWith({
      policy: expect.objectContaining({
        options,
        use: FirstPolicy,
      }),
      policyResult,
      runtimeContext: fixture.context,
    });
  });

  it('passes descriptor options to policy execute', async () => {
    const fixture = createFixture();
    const options = ['terminals', 'incidents'];
    const policy = fixture.registerPolicy(FirstPolicy, { type: 'pass' });

    await fixture.runner.execute(
      [
        new PolicyDescriptorBuilder({
          options,
          use: FirstPolicy,
        }),
      ],
      fixture.context,
    );

    expect(policy.executeMock).toHaveBeenCalledWith(fixture.context, options);
  });

  it('propagates policy failure when no onError handler is declared', async () => {
    const fixture = createFixture();
    const error = new Error('Policy завершилась с ошибкой.');

    fixture.registerPolicy(FirstPolicy, error);

    await expect(fixture.runner.execute([FirstPolicy], fixture.context)).rejects.toBe(error);
  });

  it('uses onError handler decision when policy throws', async () => {
    const fixture = createFixture();
    const error = new Error('Policy завершилась с ошибкой.');

    fixture.registerPolicy(FirstPolicy, error);
    fixture.registerHandler(FirstHandler, {
      type: 'not-found',
    });

    await expect(
      fixture.runner.execute(
        [
          new PolicyDescriptorBuilder({
            onError: FirstHandler,
            use: FirstPolicy,
          }),
        ],
        fixture.context,
      ),
    ).resolves.toEqual({ type: 'not-found' });
  });

  it('auto-binds decorated policy tokens', async () => {
    const scope = new ApplicationScope();
    const runner = new PolicyRunner<TestRuntimeContext>(scope, { kind: 'application' });

    DecoratedPolicy.executeMock = vi.fn((): PolicyResult => ({ type: 'pass' }));

    await expect(runner.execute([DecoratedPolicy], createTestRuntimeContext())).resolves.toEqual({
      type: 'continue',
    });
    expect(DecoratedPolicy.executeMock).toHaveBeenCalledTimes(1);
  });
});

interface TestRuntimeContext extends RuntimeContextInterface {
  readonly requestId: string;
}

class FirstPolicy extends PolicyInterface<TestRuntimeContext> {
  execute(): PolicyResult {
    return { type: 'pass' };
  }
}

class SecondPolicy extends PolicyInterface<TestRuntimeContext> {
  execute(): PolicyResult {
    return { type: 'pass' };
  }
}

class FirstHandler extends PolicyResultHandlerInterface<TestRuntimeContext> {
  execute(): PolicyBoundaryDecision {
    return { type: 'continue' };
  }
}

@Policy()
class DecoratedPolicy extends PolicyInterface<TestRuntimeContext> {
  static executeMock = vi.fn();

  execute(context: TestRuntimeContext): PolicyResult {
    return DecoratedPolicy.executeMock(context);
  }
}

interface Fixture {
  readonly context: TestRuntimeContext;
  readonly registerHandler: (
    token: DependencyToken<PolicyResultHandlerInterface<TestRuntimeContext>>,
    decision: PolicyBoundaryDecision,
  ) => TestPolicyResultHandler;
  readonly registerPolicy: (
    token: DependencyToken<PolicyInterface<TestRuntimeContext>>,
    result: Error | PolicyResult,
  ) => TestPolicy;
  readonly runner: PolicyRunner<TestRuntimeContext>;
}

const createFixture = (): Fixture => {
  const scope = new TestRuntimeScope();

  return {
    context: createTestRuntimeContext(),
    registerHandler: (token, decision) => {
      const handler = new TestPolicyResultHandler(decision);

      scope.register(token, handler);

      return handler;
    },
    registerPolicy: (token, result) => {
      const policy = new TestPolicy(result);

      scope.register(token, policy);

      return policy;
    },
    runner: new PolicyRunner<TestRuntimeContext>(scope as unknown as RuntimeScope, { kind: 'application' }),
  };
};

const createTestRuntimeContext = (): TestRuntimeContext => {
  return {
    app: {} as ApplicationControllerInterface,
    requestId: 'request:1',
    session: {} as SessionRuntimeStateInterface,
    signal: new AbortController().signal,
  };
};

class TestRuntimeScope {
  private readonly values = new Map<DependencyToken<unknown>, unknown>();

  get<TValue>(token: DependencyToken<TValue>): TValue {
    const value = this.values.get(token);

    if (value === undefined) {
      throw new Error('Зависимость не зарегистрирована.');
    }

    return value as TValue;
  }

  register<TValue>(token: DependencyToken<TValue>, value: TValue): void {
    this.values.set(token, value);
  }
}

class TestPolicy extends PolicyInterface<TestRuntimeContext> {
  readonly executeMock;

  constructor(private readonly result: Error | PolicyResult) {
    super();

    this.executeMock = vi.fn((context: TestRuntimeContext, options?: unknown) => {
      void context;
      void options;

      if (this.result instanceof Error) {
        throw this.result;
      }

      return this.result;
    });
  }

  execute(context: TestRuntimeContext, options?: unknown): PolicyResult {
    if (options === undefined) {
      return this.executeMock(context);
    }

    return this.executeMock(context, options);
  }
}

class TestPolicyResultHandler extends PolicyResultHandlerInterface<TestRuntimeContext> {
  readonly executeMock;

  constructor(private readonly decision: PolicyBoundaryDecision) {
    super();

    this.executeMock = vi.fn((context: PolicyResultHandlerContextInterface<TestRuntimeContext>) => {
      void context;

      return this.decision;
    });
  }

  execute(context: PolicyResultHandlerContextInterface<TestRuntimeContext>): PolicyBoundaryDecision {
    return this.executeMock(context);
  }
}
