import 'reflect-metadata';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BindingModuleInterface } from '../../../di/binding/binding-module';
import { UseBindings } from '../../../di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { RouterRuntime, type RouteRuntimeHandle } from '../../../router/runtime/router-runtime';
import { RouterServiceBindings } from '../../../router/service/router-service';
import { RouterServiceControllerInterface } from '../../../router/service/router-service-controller';
import { ApplicationScope } from '../../../runtime/scope/kind';
import { Frame, FrameDefinition } from '../../declaration/frame';
import type { FrameConstructor } from '../../declaration/frame';
import { readFrameNavigationState, writeFrameNavigationState } from '../../navigation/frame-navigation-state';
import { HashFrameSource } from '../../source/hash-frame-source';

import { FrameBindings } from './frame-service.bindings.ts';
import { FrameServiceInterface } from './frame-service.interface.ts';

interface TestFrameProps {
  readonly id: string;
}

describe('FrameService', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('opens frame by token without exposing hash key', async () => {
    const fixture = createFrameServiceFixture();

    await fixture.service.open(TestFrame, {
      id: '123',
    });

    expect(fixture.navigate).toHaveBeenCalledWith("/reports#test-frame(id='123')", {
      replace: true,
      state: undefined,
    });
    expect(readFrameNavigationState()).toEqual({
      current: {
        frameKey: 'test-frame',
        props: {
          id: '123',
        },
      },
      stack: [],
    });
  });

  it('opens frame without props as hash flag', async () => {
    const fixture = createFrameServiceFixture();

    await fixture.service.open(EmptyFrame);

    expect(fixture.navigate).toHaveBeenCalledWith('/reports#empty-frame', {
      replace: true,
      state: undefined,
    });
    expect(readFrameNavigationState()).toEqual({
      current: {
        frameKey: 'empty-frame',
        props: {},
      },
      stack: [],
    });
  });

  it('stores frame navigation state in scoped session storage', async () => {
    const fixture = createFrameServiceFixture('', [TestFrame], '/terminals-management');

    await fixture.service.open(TestFrame, {
      id: '123',
    });

    expect(readFrameNavigationState()).toBeNull();
    expect(readFrameNavigationState('/terminals-management')).toEqual({
      current: {
        frameKey: 'test-frame',
        props: {
          id: '123',
        },
      },
      stack: [],
    });
  });

  it('closes frame by token', async () => {
    const fixture = createFrameServiceFixture("#test-frame(id='123')");

    await fixture.service.close(TestFrame);

    expect(fixture.navigate).toHaveBeenCalledWith('/reports', {
      replace: true,
      state: undefined,
    });
    expect(readFrameNavigationState()).toBeNull();
  });

  it('closes frame session by token without restoring parent', async () => {
    const fixture = createFrameServiceFixture("#test-frame(id='123')", [TestFrame]);
    writeFrameNavigationState(undefined, {
      current: {
        frameKey: 'test-frame',
        props: {
          id: '123',
        },
      },
      stack: [
        {
          frameKey: 'empty-frame',
          props: {},
        },
      ],
    });

    await fixture.service.close(TestFrame);

    expect(fixture.navigate).toHaveBeenCalledWith('/reports', {
      replace: true,
      state: undefined,
    });
    expect(readFrameNavigationState()).toBeNull();
  });

  it('opens frame from current frame with parent navigation state in session storage', async () => {
    const fixture = createFrameServiceFixture('#empty-frame', [EmptyFrame, TestFrame]);
    writeFrameNavigationState(undefined, {
      current: {
        frameKey: 'empty-frame',
        props: {},
      },
      stack: [],
    });

    await fixture.service.openFromFrame(
      {
        frameKey: 'empty-frame',
        props: {},
      },
      TestFrame,
      {
        id: '123',
      },
    );

    expect(fixture.navigate).toHaveBeenLastCalledWith("/reports#test-frame(id='123')", {
      replace: true,
      state: undefined,
    });
    expect(readFrameNavigationState()).toEqual({
      current: {
        frameKey: 'test-frame',
        props: {
          id: '123',
        },
      },
      stack: [
        {
          frameKey: 'empty-frame',
          props: {},
        },
      ],
    });
  });

  it('clears another active frame before opening the next frame', async () => {
    const fixture = createFrameServiceFixture('#empty-frame');

    await fixture.service.open(TestFrame, {
      id: '123',
    });

    expect(fixture.navigate).toHaveBeenNthCalledWith(1, '/reports', {
      replace: true,
      state: undefined,
    });
    expect(fixture.navigate).toHaveBeenNthCalledWith(2, "/reports#test-frame(id='123')", {
      replace: true,
      state: undefined,
    });
    expect(readFrameNavigationState()).toEqual({
      current: {
        frameKey: 'test-frame',
        props: {
          id: '123',
        },
      },
      stack: [],
    });
  });

  it('does not restore previous frame parent when opening the next frame', async () => {
    const fixture = createFrameServiceFixture('#empty-frame', [EmptyFrame, TestFrame]);
    writeFrameNavigationState(undefined, {
      current: {
        frameKey: 'empty-frame',
        props: {},
      },
      stack: [
        {
          frameKey: 'parent-frame',
          props: {
            id: 'parent',
          },
        },
      ],
    });

    await fixture.service.open(TestFrame, {
      id: '123',
    });

    expect(fixture.navigate).toHaveBeenNthCalledWith(1, '/reports', {
      replace: true,
      state: undefined,
    });
    expect(fixture.navigate).toHaveBeenNthCalledWith(2, "/reports#test-frame(id='123')", {
      replace: true,
      state: undefined,
    });
    expect(readFrameNavigationState()).toEqual({
      current: {
        frameKey: 'test-frame',
        props: {
          id: '123',
        },
      },
      stack: [],
    });
  });

  it('goes back to parent frame from session storage after reload', async () => {
    const fixture = createFrameServiceFixture("#test-frame(id='123')", [EmptyFrame, TestFrame]);
    writeFrameNavigationState(undefined, {
      current: {
        frameKey: 'test-frame',
        props: {
          id: '123',
        },
      },
      stack: [
        {
          frameKey: 'empty-frame',
          props: {},
        },
      ],
    });

    await fixture.service.back();

    expect(fixture.navigate).toHaveBeenNthCalledWith(1, '/reports', {
      replace: true,
      state: undefined,
    });
    expect(fixture.navigate).toHaveBeenNthCalledWith(2, '/reports#empty-frame', {
      replace: true,
      state: undefined,
    });
    expect(readFrameNavigationState()).toEqual({
      current: {
        frameKey: 'empty-frame',
        props: {},
      },
      stack: [],
    });
  });

  it('reports parent frame availability from session storage', () => {
    const fixture = createFrameServiceFixture("#test-frame(id='123')", [EmptyFrame, TestFrame]);
    writeFrameNavigationState(undefined, {
      current: {
        frameKey: 'test-frame',
        props: {
          id: '123',
        },
      },
      stack: [
        {
          frameKey: 'empty-frame',
          props: {},
        },
      ],
    });

    expect(fixture.service.hasParent()).toBe(true);
    expect(fixture.service.hasParent(TestFrame)).toBe(true);
  });

  it('does not report parent frame for direct-linked frame', () => {
    const fixture = createFrameServiceFixture("#test-frame(id='123')", [EmptyFrame, TestFrame]);

    expect(fixture.service.hasParent()).toBe(false);
    expect(fixture.service.hasParent(TestFrame)).toBe(false);
  });

  it('clears stale session storage and closes direct-linked frame on back', async () => {
    const fixture = createFrameServiceFixture("#test-frame(id='123')", [TestFrame]);
    writeFrameNavigationState(undefined, {
      current: {
        frameKey: 'test-frame',
        props: {
          id: 'stale',
        },
      },
      stack: [
        {
          frameKey: 'empty-frame',
          props: {},
        },
      ],
    });

    await fixture.service.back();

    expect(fixture.navigate).toHaveBeenCalledWith('/reports', {
      replace: true,
      state: undefined,
    });
    expect(readFrameNavigationState()).toBeNull();
  });

  it('rejects current-frame close outside frame scope', async () => {
    const fixture = createFrameServiceFixture();

    await expect(fixture.service.close()).rejects.toThrow('Текущий фрейм недоступен.');
  });

  it('rejects frame commands without configured source', async () => {
    const fixture = createFrameServiceFixture();

    await expect(fixture.service.open(SourcelessFrame)).rejects.toThrow('Источник фрейма не настроен.');
    await expect(fixture.service.back(SourcelessFrame)).rejects.toThrow('Источник фрейма не настроен.');
    await expect(fixture.service.close(SourcelessFrame)).rejects.toThrow('Источник фрейма не настроен.');
  });

  it('rejects opening frame that is not available for current route', async () => {
    const fixture = createFrameServiceFixture('', [EmptyFrame]);

    await expect(fixture.service.open(TestFrame, { id: '123' })).rejects.toThrow(
      'Фрейм недоступен для текущего маршрута: TestFrame.',
    );

    expect(fixture.navigate).not.toHaveBeenCalled();
  });
});

const createFrameServiceFixture = (
  hash = '',
  frames: readonly FrameConstructor[] = [TestFrame, EmptyFrame],
  frameNavigationScope?: string,
): FrameServiceFixture => {
  const scope = new ApplicationScope();
  const routerRuntime = new RouterRuntime();

  scope.bindRouterRuntime(routerRuntime);
  routerRuntime.setFrameNavigationScope(frameNavigationScope);
  scope.activate(TestFrameServiceOwner);
  routerRuntime.register('root.route:1', createRouteRuntimeHandle(scope), {
    frames,
  });
  routerRuntime.syncActiveRoutes(['root.route:1']);

  const routerService = scope.get(RouterServiceControllerInterface);
  const navigate = vi.fn(async () => {});

  routerService.attachNavigator({
    back: vi.fn(async () => {}),
    navigate,
  });
  routerService.syncLocation({
    hash,
    key: 'location:test',
    params: {},
    pathname: '/reports',
    search: '',
    state: null,
  });

  return {
    navigate,
    service: scope.get(FrameServiceInterface),
  };
};

interface FrameServiceFixture {
  readonly navigate: ReturnType<typeof vi.fn>;
  readonly service: FrameServiceInterface;
}

const createRouteRuntimeHandle = (scope: ApplicationScope): RouteRuntimeHandle => {
  return {
    commit: vi.fn(),
    discardPending: vi.fn(),
    dispose: vi.fn(async () => {}),
    getPreparedFrameRuntime: vi.fn(() => null),
    getRuntimeScope: () => scope,
    prepareFrameRuntime: vi.fn((): never => {
      throw new Error('Runtime фрейма не нужен для тестов FrameService.');
    }),
  };
};

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

@Frame({
  view: () => null,
})
class SourcelessFrame extends FrameDefinition {}

class TestFrameServiceBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    new RouterServiceBindings().register(registry);
    new FrameBindings().register(registry);
  }
}

@UseBindings(TestFrameServiceBindings)
class TestFrameServiceOwner {}
