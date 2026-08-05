import { Inject, Injectable } from '../../../di/injection/decorators';
import { LocationServiceInterface, type RouterLocationSnapshot } from '../../../router/service/location-service';
import { NavigateServiceInterface } from '../../../router/service/navigate-service';
import { parseHashToObject } from '../../../router/utils/hash-utils';
import { parseSearchParams } from '../../../router/utils/search-utils';
import { RouterFrameAvailabilityInterface } from '../../../router/runtime/router-frame-availability';
import { RouterParamsConverterInterface } from '../../../router/params/router-params-converter';

import { getFrameMetadata, type FrameConstructor } from '../../declaration/frame';
import type { FrameSourceContextInterface } from '../../source/frame-source';
import type { FrameSourceInterface } from '../../source/frame-source';
import {
  clearFrameNavigationState,
  createFrameNavigationEntry,
  readFrameNavigationState,
  writeFrameNavigationState,
  type FrameNavigationEntry,
  type FrameNavigationState,
} from '../../navigation/frame-navigation-state';

import { FrameServiceInterface, type FrameOpenArgs } from './frame-service.interface.ts';

@Injectable()
export class FrameService extends FrameServiceInterface {
  constructor(
    @Inject(LocationServiceInterface)
    private readonly locationService: LocationServiceInterface,
    @Inject(NavigateServiceInterface)
    private readonly navigateService: NavigateServiceInterface,
    @Inject(RouterParamsConverterInterface)
    private readonly paramsConverter: RouterParamsConverterInterface,
    @Inject(RouterFrameAvailabilityInterface)
    private readonly frameAvailability: RouterFrameAvailabilityInterface,
  ) {
    super();
  }

  async back(): Promise<void>;
  async back<TFrame extends FrameConstructor>(frame: TFrame): Promise<void>;
  async back<TFrame extends FrameConstructor>(frame?: TFrame): Promise<void> {
    const source = frame ? this.resolveFrameSource(frame) : this.resolveCurrentFrameSource();

    if (!source) {
      throw new Error('Текущий фрейм недоступен.');
    }

    const navigationState = this.readValidNavigationState();
    const parent =
      navigationState?.current.frameKey === source.getNavigationKey() ? navigationState.stack.at(-1) : undefined;
    const parentSource = parent ? this.resolveFrameSourceByKey(parent.frameKey) : null;

    if (!navigationState || !parent || !parentSource) {
      this.clearNavigationState();
      await source.close(this.createFrameSourceContext());
      return;
    }

    this.writeNavigationState({
      current: parent,
      stack: navigationState.stack.slice(0, -1),
    });

    await source.close(this.createFrameSourceContext());
    await parentSource.open(this.createFrameSourceContext(), parent.props);
  }

  async open<TFrame extends FrameConstructor>(frame: TFrame, ...args: FrameOpenArgs<TFrame>): Promise<void> {
    await this.openFrame(frame, args[0], []);
  }

  async openFromFrame<TFrame extends FrameConstructor>(
    parent: FrameNavigationEntry,
    frame: TFrame,
    ...args: FrameOpenArgs<TFrame>
  ): Promise<void> {
    const navigationState = this.readValidNavigationState();
    const stack =
      navigationState && areFrameNavigationEntriesEqual(navigationState.current, parent)
        ? [...navigationState.stack, parent]
        : [parent];

    await this.openFrame(frame, args[0], stack);
  }

  private async openFrame<TFrame extends FrameConstructor>(
    frame: TFrame,
    props: FrameOpenArgs<TFrame>[0],
    stack: readonly FrameNavigationEntry[],
  ): Promise<void> {
    const metadata = getFrameMetadata(frame);

    if (!metadata.source) {
      throw new Error('Источник фрейма не настроен.');
    }

    this.assertFrameAvailable(frame);

    this.writeNavigationState({
      current: createFrameNavigationEntry(metadata.source.getNavigationKey(), props),
      stack,
    });

    await this.closeOtherFrames(frame);
    await metadata.source.open(this.createFrameSourceContext(), props);
  }

  async close(): Promise<void>;
  async close<TFrame extends FrameConstructor>(frame: TFrame): Promise<void>;
  async close<TFrame extends FrameConstructor>(frame?: TFrame): Promise<void> {
    if (!frame) {
      throw new Error('Текущий фрейм недоступен.');
    }

    const metadata = getFrameMetadata(frame);

    if (!metadata.source) {
      throw new Error('Источник фрейма не настроен.');
    }

    this.clearNavigationState();
    await metadata.source.close(this.createFrameSourceContext());
  }

  hasParent(): boolean;
  hasParent<TFrame extends FrameConstructor>(frame: TFrame): boolean;
  hasParent<TFrame extends FrameConstructor>(frame?: TFrame): boolean {
    const source = frame ? this.resolveFrameSource(frame) : this.resolveCurrentFrameSource();

    if (!source) {
      return false;
    }

    const navigationState = this.readValidNavigationState();
    const parent =
      navigationState?.current.frameKey === source.getNavigationKey() ? navigationState.stack.at(-1) : undefined;

    return !!parent && !!this.resolveFrameSourceByKey(parent.frameKey);
  }

  private createFrameSourceContext(): FrameSourceContextInterface {
    return {
      location: this.locationService.location ?? createBrowserLocation(),
      navigateService: this.navigateService,
      paramsConverter: this.paramsConverter,
    };
  }

  private async closeOtherFrames(frame: FrameConstructor): Promise<void> {
    for (const activeFrame of this.frameAvailability.getActiveFrames()) {
      if (activeFrame === frame) {
        continue;
      }

      const metadata = getFrameMetadata(activeFrame);
      const source = metadata.source;

      if (!source || !this.isFrameSourceActive(source.getNavigationKey())) {
        continue;
      }

      await source.close(this.createFrameSourceContext());
    }
  }

  private isFrameSourceActive(frameKey: string): boolean {
    const location = this.locationService.location ?? createBrowserLocation();

    return location.hashParams[frameKey] !== undefined;
  }

  private readValidNavigationState(): FrameNavigationState | null {
    const navigationState = readFrameNavigationState(this.frameAvailability.getFrameNavigationScope());

    if (!navigationState) {
      return null;
    }

    if (this.isFrameNavigationEntryActive(navigationState.current)) {
      return navigationState;
    }

    this.clearNavigationState();
    return null;
  }

  private writeNavigationState(navigationState: FrameNavigationState): void {
    writeFrameNavigationState(this.frameAvailability.getFrameNavigationScope(), navigationState);
  }

  private clearNavigationState(): void {
    clearFrameNavigationState(this.frameAvailability.getFrameNavigationScope());
  }

  private isFrameNavigationEntryActive(entry: FrameNavigationEntry): boolean {
    const location = this.locationService.location ?? createBrowserLocation();
    const rawValue = location.hashParams[entry.frameKey];

    if (rawValue === undefined) {
      return false;
    }

    return areFrameNavigationEntriesEqual(entry, createFrameNavigationEntry(entry.frameKey, getHashProps(rawValue)));
  }

  private resolveCurrentFrameSource(): FrameSourceInterface | null {
    const navigationState = this.readValidNavigationState();

    if (navigationState) {
      const source = this.resolveFrameSourceByKey(navigationState.current.frameKey);

      if (source && this.isFrameSourceActive(source.getNavigationKey())) {
        return source;
      }
    }

    for (const activeFrame of this.frameAvailability.getActiveFrames()) {
      const source = getFrameMetadata(activeFrame).source;

      if (!source || !this.isFrameSourceActive(source.getNavigationKey())) {
        continue;
      }

      return source;
    }

    return null;
  }

  private resolveFrameSource(frame: FrameConstructor): FrameSourceInterface {
    const metadata = getFrameMetadata(frame);

    if (!metadata.source) {
      throw new Error('Источник фрейма не настроен.');
    }

    return metadata.source;
  }

  private resolveFrameSourceByKey(frameKey: string): FrameSourceInterface | null {
    for (const frame of this.frameAvailability.getActiveFrames()) {
      const source = getFrameMetadata(frame).source;

      if (source?.getNavigationKey() === frameKey) {
        return source;
      }
    }

    return null;
  }

  private assertFrameAvailable(frame: FrameConstructor): void {
    if (this.frameAvailability.hasActiveFrame(frame)) {
      return;
    }

    throw new Error(`Фрейм недоступен для текущего маршрута: ${getFrameName(frame)}.`);
  }
}

const getFrameName = (frame: FrameConstructor): string => {
  if ('name' in frame && typeof frame.name === 'string' && frame.name.length > 0) {
    return frame.name;
  }

  return 'Frame';
};

const getHashProps = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
};

const areFrameNavigationEntriesEqual = (left: FrameNavigationEntry, right: FrameNavigationEntry): boolean => {
  return left.frameKey === right.frameKey && JSON.stringify(left.props) === JSON.stringify(right.props);
};

const createBrowserLocation = (): RouterLocationSnapshot => {
  const location = globalThis.location;
  const hash = location?.hash ?? '';
  const search = location?.search ?? '';

  return {
    hash,
    hashParams: parseHashToObject(hash),
    key: '',
    params: {},
    pathname: location?.pathname ?? '/',
    search,
    searchParams: parseSearchParams(search),
    state: null,
  };
};
