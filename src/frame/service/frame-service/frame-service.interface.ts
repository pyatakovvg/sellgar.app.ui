import type { FrameConstructor, FrameProps } from '../../declaration/frame';
import type { FrameNavigationEntry } from '../../navigation/frame-navigation-state';

export type FrameOpenArgs<TFrame extends FrameConstructor> = keyof FrameProps<TFrame> extends never
  ? [props?: FrameProps<TFrame>]
  : [props: FrameProps<TFrame>];

export abstract class FrameServiceInterface {
  abstract back(): Promise<void>;
  abstract back<TFrame extends FrameConstructor>(frame: TFrame): Promise<void>;

  abstract close(): Promise<void>;
  abstract close<TFrame extends FrameConstructor>(frame: TFrame): Promise<void>;

  abstract hasParent(): boolean;
  abstract hasParent<TFrame extends FrameConstructor>(frame: TFrame): boolean;

  abstract open<TFrame extends FrameConstructor>(frame: TFrame, ...args: FrameOpenArgs<TFrame>): Promise<void>;

  abstract openFromFrame<TFrame extends FrameConstructor>(
    parent: FrameNavigationEntry,
    frame: TFrame,
    ...args: FrameOpenArgs<TFrame>
  ): Promise<void>;
}
