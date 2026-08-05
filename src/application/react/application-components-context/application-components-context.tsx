import React from 'react';

import type { ApplicationComponents } from '../../config/application-configurator';

const ApplicationComponentsContext = React.createContext<ApplicationComponents>({});

export interface ApplicationComponentsProviderProps {
  readonly children: React.ReactNode;
  readonly components: ApplicationComponents;
}

export const ApplicationComponentsProvider: React.FC<ApplicationComponentsProviderProps> = ({
  children,
  components,
}) => {
  return <ApplicationComponentsContext.Provider value={components}>{children}</ApplicationComponentsContext.Provider>;
};

export const useApplicationComponents = (): ApplicationComponents => {
  return React.useContext(ApplicationComponentsContext);
};
