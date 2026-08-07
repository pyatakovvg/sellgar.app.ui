import { describe, expect, it, vi } from 'vitest';

import type { NavigateServiceInterface } from '../../../router/service/navigate-service';
import type { RouterLocationSnapshot } from '../../../router/service/location-service';
import type {
  RouterParamsConstructor,
  RouterParamsConverterInterface,
  RouterParamsObjectOptions,
} from '../../../router/params/router-params-converter';

import { HashFrameSource } from './';

interface TestFrameProps {
  readonly id: string;
}

describe('HashFrameSource', () => {
  it('returns inactive result when hash key is absent', () => {
    const source = HashFrameSource.create('user-view');
    const context = createFrameSourceContext('#terminal(id=1)');

    expect(source.resolve(context)).toEqual({
      active: false,
    });
  });

  it('returns raw nested hash params as props without target dto', () => {
    const source = HashFrameSource.create('user-view');
    const context = createFrameSourceContext("#user-view(id='123')");

    expect(source.resolve(context)).toEqual({
      active: true,
      close: expect.any(Function),
      props: {
        id: '123',
      },
      runtimeKey: 'user-view:{"id":"123"}',
    });
  });

  it('returns close handler that removes hash key through navigate service', async () => {
    const source = HashFrameSource.create('user-view');
    const navigateService = createNavigateService();
    const context = createFrameSourceContext("#user-view(id='123')", createRouterParamsConverter({}), navigateService);
    const result = source.resolve(context);

    if (!result.active) {
      throw new Error('Источник фрейма должен быть активен.');
    }

    await result.close();

    expect(navigateService.hashParams).toHaveBeenCalledWith(
      {
        'user-view': undefined,
      },
      {
        replace: undefined,
      },
    );
  });

  it('opens frame hash with props through navigate service', async () => {
    const source = HashFrameSource.create<TestFrameProps>('user-view');
    const navigateService = createNavigateService();
    const context = createFrameSourceContext('', createRouterParamsConverter({}), navigateService);

    await source.open(context, {
      id: '123',
    });

    expect(navigateService.hashParams).toHaveBeenCalledWith(
      {
        'user-view': {
          id: '123',
        },
      },
      {
        replace: undefined,
      },
    );
  });

  it('opens frame hash as flag when props are omitted or empty', async () => {
    const source = HashFrameSource.create('user-view');
    const navigateService = createNavigateService();
    const context = createFrameSourceContext('', createRouterParamsConverter({}), navigateService);

    await source.open(context);
    await source.open(context, {});

    expect(navigateService.hashParams).toHaveBeenNthCalledWith(
      1,
      {
        'user-view': null,
      },
      {
        replace: undefined,
      },
    );
    expect(navigateService.hashParams).toHaveBeenNthCalledWith(
      2,
      {
        'user-view': null,
      },
      {
        replace: undefined,
      },
    );
  });

  it('closes frame hash through navigate service', async () => {
    const source = HashFrameSource.create('user-view');
    const navigateService = createNavigateService();
    const context = createFrameSourceContext("#user-view(id='123')", createRouterParamsConverter({}), navigateService);

    await source.close(context);

    expect(navigateService.hashParams).toHaveBeenCalledWith(
      {
        'user-view': undefined,
      },
      {
        replace: undefined,
      },
    );
  });

  it('returns empty props for hash flag activation', () => {
    const source = HashFrameSource.create('user-view');
    const context = createFrameSourceContext('#user-view');

    expect(source.resolve(context)).toEqual({
      active: true,
      close: expect.any(Function),
      props: {},
      runtimeKey: 'user-view:"null"',
    });
  });

  it('converts props through router params converter when target dto is provided', () => {
    const source = HashFrameSource.create('user-view', TestFrameParams);
    const converter = createRouterParamsConverter({
      id: 'converted-id',
    });
    const context = createFrameSourceContext("#user-view(id='123')", converter);

    expect(source.resolve(context)).toEqual({
      active: true,
      close: expect.any(Function),
      props: {
        id: 'converted-id',
      },
      runtimeKey: 'user-view:{"id":"123"}',
    });
    expect(converter.toObjectMock).toHaveBeenCalledWith(
      TestFrameParams,
      {
        id: '123',
      },
      {},
    );
  });

  it('can reparse hash with enabled type conversion before dto conversion', () => {
    const source = HashFrameSource.create('user-view', TestFrameParams, {
      enableTypeConversion: true,
    });
    const converter = createRouterParamsConverter({
      id: 'converted-id',
    });
    const context = createFrameSourceContext('#user-view(id=123)', converter);

    source.resolve(context);

    expect(converter.toObjectMock).toHaveBeenCalledWith(
      TestFrameParams,
      {
        id: 123,
      },
      {
        enableTypeConversion: true,
      },
    );
  });
});

class TestFrameParams implements TestFrameProps {
  readonly id = '';
}

const createFrameSourceContext = (
  hash: string,
  paramsConverter: RouterParamsConverterInterface = createRouterParamsConverter({}),
  navigateService: NavigateServiceInterface = createNavigateService(),
  state: unknown = null,
) => {
  return {
    location: createLocation(hash, state),
    navigateService,
    paramsConverter,
  };
};

const createLocation = (hash: string, state: unknown): RouterLocationSnapshot => {
  return {
    hash,
    hashParams: hash.includes('user-view')
      ? {
          'user-view': hash.includes('(')
            ? {
                id: '123',
              }
            : 'null',
        }
      : {},
    key: 'test',
    params: {},
    pathname: '/',
    search: '',
    searchParams: {},
    state,
  };
};

interface TestRouterParamsConverter extends RouterParamsConverterInterface {
  readonly toObjectMock: ReturnType<typeof vi.fn>;
}

const createRouterParamsConverter = (result: TestFrameProps | Record<string, never>): TestRouterParamsConverter => {
  const toObjectMock = vi.fn();

  return {
    toObject<TValue extends object>(
      target: RouterParamsConstructor<TValue>,
      params: Record<string, unknown>,
      options?: RouterParamsObjectOptions,
    ): TValue {
      toObjectMock(target, params, options);

      return result as TValue;
    },
    toObjectMock,
  };
};

const createNavigateService = (): NavigateServiceInterface => {
  return {
    back: vi.fn(async () => {}),
    hashParams: vi.fn(async () => {}),
    replace: vi.fn(async () => {}),
    searchParams: vi.fn(async () => {}),
    to: vi.fn(async () => {}),
  };
};
