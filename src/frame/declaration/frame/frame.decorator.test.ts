import { describe, expect, it } from 'vitest';

import { Frame, FrameDefinition, getFrameMetadata, isFrameConstructor } from './frame.decorator.ts';

interface TestFrameProps {
  readonly id: string;
}

describe('Frame', () => {
  it('stores frame metadata on frame token', () => {
    const metadata = getFrameMetadata<TestFrameProps>(TestFrame);

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

const TestFrameView = (_props: TestFrameProps): null => {
  return null;
};

@Frame<TestFrameProps>({
  view: TestFrameView,
})
class TestFrame extends FrameDefinition<TestFrameProps> {}

class UnknownFrame extends FrameDefinition {}
