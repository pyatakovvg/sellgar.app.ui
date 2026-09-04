import React from 'react';
import { TextInput } from 'react-native';

const ScreenActivityContext = React.createContext(true);

interface ScreenActivityProviderProps extends React.PropsWithChildren {
  readonly active: boolean;
}

export const ScreenActivityProvider: React.FC<ScreenActivityProviderProps> = (props) => {
  useReleaseScreenFocus(props.active);

  return <ScreenActivityContext.Provider value={props.active}>{props.children}</ScreenActivityContext.Provider>;
};

export const ScreenActivityGate: React.FC<ScreenActivityProviderProps> = (props) => {
  const parentActive = React.useContext(ScreenActivityContext);
  const active = parentActive && props.active;

  useReleaseScreenFocus(active);

  return <ScreenActivityContext.Provider value={active}>{props.children}</ScreenActivityContext.Provider>;
};

export const useScreenActive = (): boolean => {
  return React.useContext(ScreenActivityContext);
};

const useReleaseScreenFocus = (active: boolean): void => {
  const previousActive = React.useRef(active);

  React.useLayoutEffect(() => {
    if (previousActive.current && !active) {
      const focused = TextInput.State.currentlyFocusedInput();

      if (focused) TextInput.State.blurTextInput(focused);
    }

    previousActive.current = active;
  }, [active]);
};
