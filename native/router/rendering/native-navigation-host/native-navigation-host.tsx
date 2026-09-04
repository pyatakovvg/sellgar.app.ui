import React from 'react';
import { BackHandler, ToastAndroid } from 'react-native';

import type {
  ApplicationNavigationDecision,
  ApplicationRouterHistoryEntry,
} from '../../../../core/application/lifecycle/application';
import type { NavigationState } from '../../../../core/router/runtime/navigation-state';
import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';
import type { ApplicationComponents } from '../../../application/config/application-configurator';
import type { ModuleMetadata } from '../../../module/declaration/module';
import type { NativeNavigationDriver, NativeRouterBridge } from '../../bridge/native-router-bridge';
import { RouterPresentationHost } from '../router-host';
import { NativeRouteProjectionHost } from './native-route-projection-host.tsx';
import { resolveRootBack } from './native-root-back';

interface NativeNavigationHostProps {
  readonly bridge: NativeRouterBridge;
  readonly components: ApplicationComponents;
  readonly current: NavigationState | undefined;
  readonly decision: ApplicationNavigationDecision | null;
  readonly getHistoryEntries: () => readonly ApplicationRouterHistoryEntry<ModuleMetadata>[];
  readonly onPresentationComplete: () => void;
  readonly runtime: RouterRuntime<ModuleMetadata>;
}

export const NativeNavigationHost: React.FC<NativeNavigationHostProps> = (props) => {
  const rootBackPressedAt = React.useRef<number | null>(null);
  const navigation = React.useSyncExternalStore(
    props.bridge.subscribe,
    props.bridge.getSnapshot,
    props.bridge.getSnapshot,
  );
  React.useSyncExternalStore(
    React.useCallback((listener) => props.runtime.subscribe(listener), [props.runtime]),
    React.useCallback(() => props.runtime.getSnapshot(), [props.runtime]),
    React.useCallback(() => props.runtime.getSnapshot(), [props.runtime]),
  );
  const historyEntries = props.getHistoryEntries();
  const focusedEntry = historyEntries.at(-1) ?? null;
  const pending = props.runtime.getPendingNavigation();

  React.useEffect(() => {
    rootBackPressedAt.current = null;
  }, [focusedEntry?.key]);

  React.useEffect(() => {
    const driver: NativeNavigationDriver = {
      rootBack: () => {
        const resolution = resolveRootBack(rootBackPressedAt.current, Date.now());

        rootBackPressedAt.current = resolution.pressedAt;

        if (resolution.exit) {
          BackHandler.exitApp();
        } else {
          ToastAndroid.show('Нажмите «Назад» ещё раз, чтобы свернуть приложение', ToastAndroid.SHORT);
        }
      },
    };

    return props.bridge.registerDriver(driver);
  }, [props.bridge]);

  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void props.bridge.back();
      return true;
    });

    return () => subscription.remove();
  }, [props.bridge]);

  return (
    <RouterPresentationHost components={props.components} decision={props.decision} runtime={props.runtime}>
      {({ components }) => (
        <NativeRouteProjectionHost
          components={components}
          current={props.current}
          dismissing={pending ? navigation.backInProgress : navigation.action === 'pop'}
          entries={historyEntries}
          onPresentationComplete={props.onPresentationComplete}
          pending={pending}
        />
      )}
    </RouterPresentationHost>
  );
};
