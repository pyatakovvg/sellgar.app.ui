import 'reflect-metadata';

import React from 'react';
import { describe, expect, it } from 'vitest';

import { Controller } from '../../../controller/contract/controller';

import { BindingModuleInterface } from '../../../di/binding/binding-module';
import { UseBindings } from '../../../di/composition/use-bindings';
import { ApplicationScope } from '../../../runtime/scope/kind';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import type {
  RuntimeProviderCleanup,
  RuntimeProviderContextInterface,
} from '../../../runtime/provider/runtime-provider';

import { Widget, WidgetDefinition } from '../../declaration/widget';

import { WidgetControllerInterface, type WidgetControllerLoaderArgs } from '../widget-controller';
import { WidgetRuntimeFactory } from './widget-runtime-factory.ts';

describe('WidgetRuntimeFactory', () => {
  it('preloads widget runtime and returns cleanup', async () => {
    resetTestWidgetController();

    const scope = new ApplicationScope();
    const factory = new WidgetRuntimeFactory();
    const context = createProviderContext(scope);
    const providerCleanup = await factory.preload<TestWidgetProps>(context, TestWidget, {
      props: {
        value: 'preloaded',
      },
    });

    const runtime = factory.getPrepared<TestWidgetProps>(TestWidget, {
      ownerScope: scope,
    });

    expect(runtime?.getSnapshot().phase).toBe('ready');
    expect(runtime?.getLoaderData(TestWidgetController)).toBe('preloaded');

    assertRuntimeProviderCleanup(providerCleanup);
    await providerCleanup();

    expect(factory.getPrepared(TestWidget, { ownerScope: scope })).toBeNull();
    expect(runtime?.getSnapshot().phase).toBe('disposed');
    expect(TestWidgetController.disposeCount).toBe(1);
  });

  it('revalidates already prepared widget runtime on repeated preload', async () => {
    resetTestWidgetController();

    const scope = new ApplicationScope();
    const factory = new WidgetRuntimeFactory();
    const firstContext = createProviderContext(scope);
    const secondContext = createProviderContext(scope);
    const providerCleanup = await factory.preload<TestWidgetProps>(firstContext, TestWidget, {
      props: {
        value: 'preloaded',
      },
    });

    const repeatedProviderResult = await factory.preload<TestWidgetProps>(secondContext, TestWidget, {
      props: {
        value: 'revalidated',
      },
    });

    const runtime = factory.getPrepared<TestWidgetProps>(TestWidget, {
      ownerScope: scope,
    });

    expect(repeatedProviderResult).toBeUndefined();
    expect(runtime?.getSnapshot().phase).toBe('ready');
    expect(runtime?.getLoaderData(TestWidgetController)).toBe('revalidated');
    expect(TestWidgetController.loaderValues).toEqual(['preloaded', 'revalidated']);

    assertRuntimeProviderCleanup(providerCleanup);
    await providerCleanup();
  });

  it('consumes prepared widget runtime once', async () => {
    resetTestWidgetController();

    const scope = new ApplicationScope();
    const factory = new WidgetRuntimeFactory();
    const context = createProviderContext(scope);
    const providerCleanup = await factory.preload<TestWidgetProps>(context, TestWidget, {
      props: {
        value: 'preloaded',
      },
    });

    const runtime = factory.consumePrepared<TestWidgetProps>(TestWidget, {
      ownerScope: scope,
      props: {
        value: 'consumed',
      },
    });

    expect(runtime?.getSnapshot().phase).toBe('ready');
    expect(runtime?.getProps()).toEqual({ value: 'consumed' });
    expect(factory.getPrepared(TestWidget, { ownerScope: scope })).toBeNull();
    expect(factory.consumePrepared(TestWidget, { ownerScope: scope })).toBeNull();

    assertRuntimeProviderCleanup(providerCleanup);
    await providerCleanup();

    expect(runtime?.getSnapshot().phase).toBe('ready');

    await runtime?.dispose();
  });
});

interface TestWidgetProps {
  readonly value: string;
}

@Controller()
class TestWidgetController extends WidgetControllerInterface<TestWidgetProps> {
  static disposeCount = 0;
  static loaderValues: string[] = [];

  loader(args: WidgetControllerLoaderArgs<TestWidgetProps>): string {
    TestWidgetController.loaderValues.push(args.props.value);

    return args.props.value;
  }

  dispose(): void {
    TestWidgetController.disposeCount++;
  }
}

class TestWidgetBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(TestWidgetController).toSelf().inSingletonScope();
  }
}

@UseBindings(TestWidgetBindings)
@Widget({
  view: () => React.createElement('div'),
})
class TestWidget extends WidgetDefinition<TestWidgetProps> {}

const resetTestWidgetController = (): void => {
  TestWidgetController.disposeCount = 0;
  TestWidgetController.loaderValues = [];
};

const assertRuntimeProviderCleanup: (value: unknown) => asserts value is RuntimeProviderCleanup = (value) => {
  if (typeof value !== 'function') {
    throw new Error('Provider cleanup не был создан.');
  }
};

const createProviderContext = (scope: ApplicationScope): RuntimeProviderContextInterface => {
  const request = new Request('https://tiyn-app.test/widget-preload');

  return {
    params: {},
    phase: 'beforeRender',
    props: {},
    request,
    scope,
    signal: request.signal,
  };
};
