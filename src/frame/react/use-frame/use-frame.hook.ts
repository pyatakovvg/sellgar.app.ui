import React from 'react';

import { useFrameContextOrNull } from '../frame-context';
import { useDependency } from '../../../runtime/react';
import { FrameServiceInterface, type FrameOpenArgs } from '../../service/frame-service';

import type { FrameConstructor } from '../../declaration/frame';

export interface CurrentFrameHandle {
  readonly back: () => Promise<void>;
  readonly close: () => Promise<void>;
  readonly hasParent: boolean;
  readonly open: boolean;
}

export interface FrameHandle<TFrame extends FrameConstructor> {
  readonly back: () => Promise<void>;
  readonly close: () => Promise<void>;
  readonly hasParent: boolean;
  readonly open: (...args: FrameOpenArgs<TFrame>) => Promise<void>;
}

export function useFrame(): CurrentFrameHandle;
export function useFrame<TFrame extends FrameConstructor>(frame: TFrame): FrameHandle<TFrame>;
export function useFrame<TFrame extends FrameConstructor>(frame?: TFrame): CurrentFrameHandle | FrameHandle<TFrame> {
  const frameService = useDependency(FrameServiceInterface);
  const currentFrame = useFrameContextOrNull();

  return React.useMemo(() => {
    if (!frame) {
      if (!currentFrame) {
        throw new Error('Текущий фрейм недоступен.');
      }

      return {
        back: currentFrame.back,
        close: currentFrame.close,
        hasParent: currentFrame.hasParent,
        open: currentFrame.open,
      };
    }

    return {
      back: () => {
        return frameService.back(frame);
      },
      close: () => {
        return frameService.close(frame);
      },
      hasParent: frameService.hasParent(frame),
      open: (...args: FrameOpenArgs<TFrame>) => {
        return frameService.open(frame, ...args);
      },
    };
  }, [currentFrame, frame, frameService]);
}
