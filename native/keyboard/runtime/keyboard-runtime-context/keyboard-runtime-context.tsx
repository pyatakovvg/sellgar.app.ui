import React from 'react';
import { Keyboard } from 'react-native';

export interface KeyboardRuntimeValue {
  readonly dismiss: () => void;
  readonly visible: boolean;
}

const KeyboardRuntimeContext = React.createContext<KeyboardRuntimeValue | null>(null);

export const KeyboardRuntimeProvider: React.FC<React.PropsWithChildren> = (props) => {
  const [visible, setVisible] = React.useState(() => Keyboard.isVisible());
  const dismiss = React.useCallback(() => Keyboard.dismiss(), []);

  React.useEffect(() => {
    const subscriptions = [
      Keyboard.addListener('keyboardDidShow', () => setVisible(true)),
      Keyboard.addListener('keyboardDidHide', () => setVisible(false)),
    ];

    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

  const value = React.useMemo<KeyboardRuntimeValue>(() => ({ dismiss, visible }), [dismiss, visible]);

  return <KeyboardRuntimeContext.Provider value={value}>{props.children}</KeyboardRuntimeContext.Provider>;
};

export const useKeyboardRuntime = (): KeyboardRuntimeValue => {
  const runtime = React.useContext(KeyboardRuntimeContext);

  if (!runtime) {
    throw new Error('Keyboard API доступен только внутри Native Application.');
  }

  return runtime;
};
