import 'reflect-metadata';

import { renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { BindingModuleInterface } from '../../../di/binding/binding-module';
import { UseBindings } from '../../../di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { ApplicationScope } from '../../../runtime/scope/kind';
import { RuntimeScopeProvider } from '../../../runtime/react';
import { Frame, FrameDefinition } from '../../declaration/frame';
import { FrameServiceInterface } from '../../service/frame-service';
import { HashFrameSource } from '../../source/hash-frame-source';

import { FrameContextProvider } from '../frame-context';

import { useFrame } from './';

interface TestFrameProps {
  readonly id: string;
}

describe('useFrame', () => {
  it('returns frame-bound commands', async () => {
    const { frameService, wrapper } = createUseFrameFixture();
    const { result } = renderHook(() => useFrame(TestFrame), {
      wrapper,
    });

    await result.current.open({
      id: '123',
    });
    await result.current.back();
    await result.current.close();

    expect(frameService.open).toHaveBeenCalledWith(TestFrame, {
      id: '123',
    });
    expect(frameService.back).toHaveBeenCalledWith(TestFrame);
    expect(frameService.close).toHaveBeenCalledWith(TestFrame);
    expect(frameService.hasParent).toHaveBeenCalledWith(TestFrame);
    expect(result.current.hasParent).toBe(false);
  });

  it('allows opening prop-less frames without arguments', async () => {
    const { frameService, wrapper } = createUseFrameFixture();
    const { result } = renderHook(() => useFrame(EmptyFrame), {
      wrapper,
    });

    await result.current.open();

    expect(frameService.open).toHaveBeenCalledWith(EmptyFrame);
  });

  it('returns current frame commands from frame context', async () => {
    const { wrapper } = createUseFrameFixture();
    const BaseWrapper = wrapper;
    const back = vi.fn(async () => {});
    const close = vi.fn(async () => {});
    const { result } = renderHook(() => useFrame(), {
      wrapper: ({ children }) => {
        return (
          <BaseWrapper>
            <FrameContextProvider back={back} close={close} hasParent={true} open={true}>
              {children}
            </FrameContextProvider>
          </BaseWrapper>
        );
      },
    });

    expect(result.current.open).toBe(true);
    expect(result.current.hasParent).toBe(true);

    await result.current.back();
    await result.current.close();

    expect(back).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});

const createUseFrameFixture = (): UseFrameFixture => {
  const frameService = new TestFrameService();

  TestUseFrameBindings.frameService = frameService;

  const scope = new ApplicationScope();

  scope.activate(TestUseFrameOwner);

  return {
    frameService,
    wrapper: ({ children }) => {
      return <RuntimeScopeProvider scope={scope}>{children}</RuntimeScopeProvider>;
    },
  };
};

interface UseFrameFixture {
  readonly frameService: TestFrameService;
  readonly wrapper: React.FC<React.PropsWithChildren>;
}

class TestFrameService extends FrameServiceInterface {
  readonly back = vi.fn(async () => {});
  readonly close = vi.fn(async () => {});
  readonly hasParent = vi.fn(() => false);
  readonly open = vi.fn(async () => {});
  readonly openFromFrame = vi.fn(async () => {});
}

@Frame<TestFrameProps>({
  source: HashFrameSource.create('test-frame'),
  view: () => null,
})
class TestFrame extends FrameDefinition<TestFrameProps> {}

@Frame({
  source: HashFrameSource.create('empty-frame'),
  view: () => null,
})
class EmptyFrame extends FrameDefinition {}

class TestUseFrameBindings extends BindingModuleInterface {
  static frameService: FrameServiceInterface = new TestFrameService();

  register(registry: BindingRegistryInterface): void {
    registry.bind(FrameServiceInterface).toConstantValue(TestUseFrameBindings.frameService);
  }
}

@UseBindings(TestUseFrameBindings)
class TestUseFrameOwner {}
