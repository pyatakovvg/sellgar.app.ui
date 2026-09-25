import React from 'react';

import type { ApplicationComponents } from '../../config/application-configurator';

const ApplicationComponentsContext = React.createContext<ApplicationComponents>({});

interface IProps {
  readonly children: React.ReactNode;
  readonly components: ApplicationComponents;
}

export const ApplicationComponentsProvider: React.FC<IProps> = (props) => {
  return (
    <ApplicationComponentsContext.Provider value={props.components}>
      {props.children}
    </ApplicationComponentsContext.Provider>
  );
};

export const useApplicationComponents = (): ApplicationComponents => {
  return React.useContext(ApplicationComponentsContext);
};
