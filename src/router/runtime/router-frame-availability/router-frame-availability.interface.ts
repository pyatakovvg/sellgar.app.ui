import type { FrameConstructor } from '../../../frame/declaration/frame';

export abstract class RouterFrameAvailabilityInterface {
  abstract getActiveFrames(): readonly FrameConstructor[];

  abstract getFrameNavigationScope(): string | undefined;

  abstract hasActiveFrame(frame: FrameConstructor): boolean;
}
