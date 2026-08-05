import type { FrameConstructor } from '../../../frame/declaration/frame';
import { FrameRuntime } from '../../../frame/runtime/frame-runtime';
import type { RuntimeScope } from '../../../runtime/scope/base';

type ErasedFrameRuntimeMap = Map<string, FrameRuntime<object>>;
type TypedFrameRuntimeMap<TProps extends object> = Map<string, FrameRuntime<TProps>>;

const DEFAULT_FRAME_RUNTIME_KEY = 'default';

const createFrameRuntimeKey = (runtimeKey: string | undefined): string => {
  return runtimeKey ?? DEFAULT_FRAME_RUNTIME_KEY;
};

export class FrameRuntimeRegistry {
  private readonly frameRuntimes = new Map<FrameConstructor, ErasedFrameRuntimeMap>();

  collectInactiveExcept(
    activeRuntimeKeys: ReadonlyMap<FrameConstructor, string | undefined>,
  ): Array<FrameRuntime<object>> {
    const inactiveFrameRuntimes: Array<FrameRuntime<object>> = [];

    this.frameRuntimes.forEach((frameRuntimes, frame) => {
      const activeRuntimeKey = activeRuntimeKeys.has(frame)
        ? createFrameRuntimeKey(activeRuntimeKeys.get(frame))
        : null;

      frameRuntimes.forEach((frameRuntime, frameRuntimeKey) => {
        if (frameRuntimeKey === activeRuntimeKey) {
          return;
        }

        frameRuntimes.delete(frameRuntimeKey);
        inactiveFrameRuntimes.push(frameRuntime);
      });

      if (frameRuntimes.size === 0) {
        this.frameRuntimes.delete(frame);
      }
    });

    return inactiveFrameRuntimes;
  }

  drain(): Array<FrameRuntime<object>> {
    const frameRuntimes = this.getAll();

    this.frameRuntimes.clear();

    return frameRuntimes;
  }

  drainFrame(frame: FrameConstructor): Array<FrameRuntime<object>> {
    const frameRuntimes = this.frameRuntimes.get(frame);

    if (!frameRuntimes) {
      return [];
    }

    const runtimes = [...frameRuntimes.values()];

    this.frameRuntimes.delete(frame);

    return runtimes;
  }

  getAll(): Array<FrameRuntime<object>> {
    return [...this.frameRuntimes.values()].flatMap((frameRuntimes) => {
      return [...frameRuntimes.values()];
    });
  }

  getPrepared<TProps extends object>(
    frame: FrameConstructor<TProps>,
    runtimeKey: string | undefined,
  ): FrameRuntime<TProps> | null {
    const frameRuntimes = this.getFrameRuntimeMapOrNull(frame);
    const frameRuntimeKey = createFrameRuntimeKey(runtimeKey);
    const runtime = frameRuntimes?.get(frameRuntimeKey);

    if (!runtime) {
      return null;
    }

    if (runtime.getSnapshot().phase === 'disposed') {
      frameRuntimes?.delete(frameRuntimeKey);

      return null;
    }

    return runtime;
  }

  prepare<TProps extends object>(
    frame: FrameConstructor<TProps>,
    runtimeKey: string | undefined,
    props: TProps,
    ownerScope: RuntimeScope,
  ): FrameRuntime<TProps> {
    const frameRuntimes = this.getFrameRuntimeMap(frame);
    const frameRuntimeKey = createFrameRuntimeKey(runtimeKey);
    const preparedRuntime = frameRuntimes.get(frameRuntimeKey);

    if (preparedRuntime && preparedRuntime.getSnapshot().phase !== 'disposed') {
      return preparedRuntime;
    }

    const runtime = new FrameRuntime(ownerScope, frame, props);

    frameRuntimes.set(frameRuntimeKey, runtime);

    return runtime;
  }

  private getFrameRuntimeMap<TProps extends object>(frame: FrameConstructor<TProps>): TypedFrameRuntimeMap<TProps> {
    let frameRuntimes = this.frameRuntimes.get(frame);

    if (!frameRuntimes) {
      frameRuntimes = new Map();
      this.frameRuntimes.set(frame, frameRuntimes);
    }

    return frameRuntimes as unknown as TypedFrameRuntimeMap<TProps>;
  }

  private getFrameRuntimeMapOrNull<TProps extends object>(
    frame: FrameConstructor<TProps>,
  ): TypedFrameRuntimeMap<TProps> | null {
    const frameRuntimes = this.frameRuntimes.get(frame);

    return frameRuntimes ? (frameRuntimes as unknown as TypedFrameRuntimeMap<TProps>) : null;
  }
}
