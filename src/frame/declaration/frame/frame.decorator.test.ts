import { describe, expect, it } from 'vitest';

import { Frame, getFrameMetadata, isFrameConstructor } from './';

describe('Frame', () => {
  it('stores frame metadata on frame token', () => {
    const metadata = getFrameMetadata(TestFrame);

    expect(metadata.view).toBe(TestFrameView);
    expect(isFrameConstructor(TestFrame)).toBe(true);
  });

  it('rejects tokens without frame metadata', () => {
    expect(() => {
      getFrameMetadata(UnknownFrame);
    }).toThrow('Метаданные фрейма не определены.');
    expect(isFrameConstructor(UnknownFrame)).toBe(false);
  });
});

const TestFrameView = (): null => {
  return null;
};

@Frame({
  view: TestFrameView,
})
class TestFrame {}

class UnknownFrame {}
