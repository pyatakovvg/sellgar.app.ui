import React from 'react';

interface KeyboardScrollOwnerValue {
  readonly revealAutoFocus: (target: number) => () => void;
}

const KeyboardScrollOwnerContext = React.createContext<KeyboardScrollOwnerValue | null>(null);

export const KeyboardScrollOwnerProvider = KeyboardScrollOwnerContext.Provider;

export const useKeyboardScrollOwner = (): KeyboardScrollOwnerValue | null => {
  return React.useContext(KeyboardScrollOwnerContext);
};
