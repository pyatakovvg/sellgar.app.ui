import React from 'react';

export const useShellDismissRequest = (dismiss: () => void | Promise<void>): (() => void) => {
  const dismissStarted = React.useRef(false);
  const [dismissRequested, setDismissRequested] = React.useState(false);

  React.useEffect(() => {
    if (!dismissRequested || dismissStarted.current) return;

    dismissStarted.current = true;
    void dismiss();
  }, [dismiss, dismissRequested]);

  return React.useCallback(() => setDismissRequested(true), []);
};
