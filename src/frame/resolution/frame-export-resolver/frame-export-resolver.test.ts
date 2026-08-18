import { describe, expect, it } from 'vitest';

import { Frame } from '../../declaration/frame';

import { resolveFrameExport } from './frame-export-resolver.ts';

const FrameView = () => null;

@Frame({ view: FrameView })
class FirstFrame {}

@Frame({ view: FrameView })
class SecondFrame {}

describe('resolveFrameExport', () => {
  it('returns the only exported frame declaration', () => {
    expect(resolveFrameExport({ FirstFrame, helper: true })).toBe(FirstFrame);
  });

  it('rejects a package without frame declaration', () => {
    expect(() => resolveFrameExport({ helper: true })).toThrow('Экспорт frame не найден. Экспорты: helper.');
  });

  it('rejects a package with multiple frame declarations', () => {
    expect(() => resolveFrameExport({ FirstFrame, SecondFrame })).toThrow(
      'Frame package должен экспортировать ровно один класс @Frame.',
    );
  });
});
