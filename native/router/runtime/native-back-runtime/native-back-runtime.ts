import { BackHandler, ToastAndroid } from 'react-native';

import type {
  ApplicationLifecycleListener,
  ApplicationLifecycleSnapshot,
} from '../../../../core/application/lifecycle/application-lifecycle';
import type { NativeNavigationDriver, NativeRouterBridge } from '../../bridge/native-router-bridge';

export interface NativeBackLifecycleSource {
  readonly getLifecycle: () => ApplicationLifecycleSnapshot;
  readonly subscribeLifecycle: (listener: ApplicationLifecycleListener) => () => void;
}

/** Owns the platform Back input and delegates logical navigation to core through the bridge. */
export class NativeBackRuntime {
  private pressedAt: number | null = null;
  private removeBackListener: (() => void) | null = null;
  private unregisterDriver: (() => void) | null = null;
  private unsubscribeBridge: (() => void) | null = null;
  private readonly unsubscribeLifecycle: () => void;

  constructor(
    private readonly bridge: NativeRouterBridge,
    private readonly lifecycle: NativeBackLifecycleSource,
  ) {
    this.unsubscribeLifecycle = lifecycle.subscribeLifecycle(this.synchronize);
    this.synchronize();
  }

  dispose(): void {
    this.deactivate();
    this.unsubscribeLifecycle();
  }

  private readonly synchronize = (): void => {
    if (this.lifecycle.getLifecycle().phase === 'ready') {
      this.activate();
    } else {
      this.deactivate();
    }
  };

  private activate(): void {
    if (this.unregisterDriver) return;

    const driver: NativeNavigationDriver = { rootBack: this.handleRootBack };

    this.unsubscribeBridge = this.bridge.subscribe(this.resetRootBack);
    this.unregisterDriver = this.bridge.registerDriver(driver);
    const subscription = BackHandler.addEventListener('hardwareBackPress', this.handleBack);
    this.removeBackListener = () => subscription.remove();
  }

  private deactivate(): void {
    this.removeBackListener?.();
    this.unregisterDriver?.();
    this.unsubscribeBridge?.();
    this.removeBackListener = null;
    this.unregisterDriver = null;
    this.unsubscribeBridge = null;
    this.pressedAt = null;
  }

  private readonly handleBack = (): boolean => {
    void this.bridge.back();
    return true;
  };

  private readonly handleRootBack = (): void => {
    const resolution = resolveRootBack(this.pressedAt, Date.now());

    this.pressedAt = resolution.pressedAt;

    if (resolution.exit) {
      BackHandler.exitApp();
      return;
    }

    ToastAndroid.show('Нажмите «Назад» ещё раз, чтобы свернуть приложение', ToastAndroid.SHORT);
  };

  private readonly resetRootBack = (): void => {
    this.pressedAt = null;
  };
}

export interface RootBackResolution {
  readonly exit: boolean;
  readonly pressedAt: number | null;
}

const resolveRootBack = (previousPressedAt: number | null, pressedAt: number): RootBackResolution => {
  const elapsed = previousPressedAt === null ? Number.POSITIVE_INFINITY : pressedAt - previousPressedAt;
  const exit = elapsed >= 0 && elapsed <= ROOT_BACK_CONFIRMATION_WINDOW;

  return Object.freeze({ exit, pressedAt: exit ? null : pressedAt });
};

const ROOT_BACK_CONFIRMATION_WINDOW = 2_000;
