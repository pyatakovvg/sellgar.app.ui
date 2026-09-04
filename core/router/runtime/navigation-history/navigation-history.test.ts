import { describe, expect, it } from 'vitest';

import type { NavigationState } from '../navigation-state';
import { NavigationHistory } from './navigation-history';

describe('NavigationHistory', () => {
  it('keeps chronological entries and releases only unreferenced activations on pop', () => {
    const history = new NavigationHistory<object>();
    const products = {};
    const brands = {};

    history.push(navigation('products'), products, 'products:1');
    history.push(navigation('brands'), brands, 'brands:1');
    history.push(navigation('products'), products, 'products:2');

    const firstPop = history.pop();

    expect(firstPop?.current.id).toBe('brands:1');
    expect(firstPop?.released).toEqual([]);

    const secondPop = history.pop();

    expect(secondPop?.current.id).toBe('products:1');
    expect(secondPop?.released).toEqual([brands]);
  });

  it('updates query in the current entry without creating a back step', () => {
    const history = new NavigationHistory<object>();
    const activation = {};

    history.push(navigation('products'), activation);
    history.updateCurrent(navigation('products', { search: 'dress' }));

    expect(history.length).toBe(1);
    expect(history.current?.activation).toBe(activation);
    expect(history.current?.navigation.root.query).toEqual({ search: 'dress' });
  });

  it('resets an inaccessible policy branch and releases its activations once', () => {
    const history = new NavigationHistory<object>();
    const products = {};
    const product = {};
    const signIn = {};

    history.push(navigation('products'), products);
    history.push(navigation('product'), product);

    const mutation = history.reset(navigation('sign-in'), signIn);

    expect(history.snapshot()).toHaveLength(1);
    expect(mutation.released).toEqual([products, product]);
  });

  it('keeps navigation entries but releases inactive runtimes in release mode', () => {
    const history = new NavigationHistory<object>();
    const products = {};
    const brands = {};

    history.push(navigation('products'), products, 'products:1');
    history.push(navigation('brands'), brands, 'brands:1');

    expect(history.releaseInactiveActivations()).toEqual([products]);
    expect(history.find('products:1')?.activation).toBeNull();
    expect(history.current?.activation).toBe(brands);
  });

  it('replaces a released history entry with a freshly created runtime on restore', () => {
    const history = new NavigationHistory<object>();
    const products = {};
    const brands = {};
    const restartedProducts = {};

    history.push(navigation('products'), products, 'products:1');
    history.push(navigation('brands'), brands, 'brands:1');
    history.releaseInactiveActivations();

    const mutation = history.restore('products:1', navigation('products'), restartedProducts);

    expect(history.snapshot()).toHaveLength(1);
    expect(mutation?.current.activation).toBe(restartedProducts);
    expect(mutation?.released).toEqual([brands]);
  });
});

const navigation = (name: string, query: Readonly<Record<string, unknown>> = {}): NavigationState =>
  ({
    boundary: null,
    initiator: null,
    pendingNestedAddress: null,
    replace: false,
    revalidation: null,
    root: {
      child: null,
      owner: null,
      path: [{ params: {}, route: { name } as never, token: undefined }],
      query,
      router: {} as never,
    },
    state: undefined,
  }) satisfies NavigationState;
