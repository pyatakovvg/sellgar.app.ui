import React from 'react';

export interface ExceptionProviderProps {
  readonly children: React.ReactNode;
  readonly error: unknown;
}

const ExceptionContext = React.createContext<unknown>(null);

export const ExceptionProvider: React.FC<ExceptionProviderProps> = ({ children, error }) => {
  return <ExceptionContext.Provider value={error}>{children}</ExceptionContext.Provider>;
};

export const useException = (): unknown => {
  return React.useContext(ExceptionContext);
};
