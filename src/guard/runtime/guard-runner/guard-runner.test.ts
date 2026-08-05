import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { BindingModuleInterface } from '../../../di/binding/binding-module';
import { Guard, GuardInterface } from '../../contract/guard';
import { Injectable } from '../../../di/injection/decorators';
import { UseBindings } from '../../../di/composition/use-bindings';
import { GuardFailure } from '../../contract/guard-failure-strategy';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { ApplicationScope } from '../../../runtime/scope/kind';

import { GuardRunner } from './guard-runner.ts';

describe('GuardRunner', () => {
  it('passes when all guards pass', async () => {
    const fixture = createGuardRunnerFixture(true, true);

    await expect(fixture.runner.execute([FirstGuardInterface, SecondGuardInterface], {})).resolves.toEqual({
      type: 'pass',
    });
  });

  it('fails on first rejected guard and keeps its failure strategy', async () => {
    const fixture = createGuardRunnerFixture(true, false);

    await expect(
      fixture.runner.execute(
        [FirstGuardInterface, SecondGuardInterface.configure().failureStrategy(GuardFailure.returnNull())],
        {},
      ),
    ).resolves.toMatchObject({
      guard: {
        failureStrategy: {
          type: 'return-value',
          value: null,
        },
        use: SecondGuardInterface,
      },
      type: 'fail',
    });
  });

  it('auto-binds decorated guard tokens', async () => {
    DecoratedGuard.result = true;

    const scope = new ApplicationScope();
    const runner = new GuardRunner(scope);

    await expect(runner.execute([DecoratedGuard], {})).resolves.toEqual({
      type: 'pass',
    });
  });
});

const createGuardRunnerFixture = (firstResult: boolean, secondResult: boolean): GuardRunnerFixture => {
  FirstGuard.result = firstResult;
  SecondGuard.result = secondResult;

  const scope = new ApplicationScope();

  scope.activate(TestGuardRunnerOwner);

  return {
    runner: new GuardRunner(scope),
  };
};

interface GuardRunnerFixture {
  readonly runner: GuardRunner;
}

abstract class FirstGuardInterface extends GuardInterface<object> {}

@Injectable()
class FirstGuard extends FirstGuardInterface {
  static result = true;

  execute(): boolean {
    return FirstGuard.result;
  }
}

abstract class SecondGuardInterface extends GuardInterface<object> {}

@Injectable()
class SecondGuard extends SecondGuardInterface {
  static result = true;

  execute(): boolean {
    return SecondGuard.result;
  }
}

class TestGuardRunnerBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(FirstGuardInterface).to(FirstGuard).inSingletonScope();
    registry.bind(SecondGuardInterface).to(SecondGuard).inSingletonScope();
  }
}

@UseBindings(TestGuardRunnerBindings)
class TestGuardRunnerOwner {}

@Guard()
class DecoratedGuard extends GuardInterface<object> {
  static result = true;

  execute(): boolean {
    return DecoratedGuard.result;
  }
}
