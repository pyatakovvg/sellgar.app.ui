import React from 'react';

export const useShellDismissRequest = (dismiss: () => void | Promise<void>): (() => void) => {
  const dismissStarted = React.useRef(false);
  const dismissRef = React.useRef(dismiss);

  React.useLayoutEffect(() => {
    dismissRef.current = dismiss;
  }, [dismiss]);

  return React.useCallback(() => {
    if (dismissStarted.current) return;

    dismissStarted.current = true;
    void dismissRef.current();
  }, []);
};
