import { describe, expect, it } from 'vitest';

import type { ScreenPresentation } from '../../declaration/screen-presentation';
import { ScreenRuntime } from './screen-runtime.ts';

describe('ScreenRuntime projection completion', () => {
  it('does not await a new screen commit when only retained scenes change', () => {
    const runtime = new ScreenRuntime();
    const current = presentation('products', 'Products');
    const retained = presentation('brands', 'Brands');

    expect(runtime.project(current, [retained])).toEqual({
      awaitsCompletion: true,
      changed: true,
    });

    expect(runtime.project(current)).toEqual({
      awaitsCompletion: false,
      changed: true,
    });
  });

  it('awaits a screen commit when current content changes without changing identity', () => {
    const runtime = new ScreenRuntime();

    runtime.project(presentation('products', 'Fallback'));

    expect(runtime.project(presentation('products', 'Products'))).toEqual({
      awaitsCompletion: true,
      changed: true,
    });
  });

  it('awaits a screen commit when the current screen identity changes', () => {
    const runtime = new ScreenRuntime();

    runtime.project(presentation('products', 'Products'));

    expect(runtime.project(presentation('brands', 'Brands'))).toEqual({
      awaitsCompletion: true,
      changed: true,
    });
  });
});

const presentation = (key: string, content: string): ScreenPresentation => Object.freeze({ content, key });
