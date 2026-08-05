import { inject, injectable, multiInject, optional } from 'inversify';
import type { ServiceIdentifier } from 'inversify';

import type { DependencyToken } from '../../token/dependency-token';

export const Injectable = (): ClassDecorator => {
  return injectable();
};

export const Inject = <TValue>(token: DependencyToken<TValue>): ParameterDecorator & PropertyDecorator => {
  return inject(token as ServiceIdentifier<TValue>);
};

export const Optional = (): ParameterDecorator & PropertyDecorator => {
  return optional();
};

export const MultiInject = <TValue>(token: DependencyToken<TValue>): ParameterDecorator & PropertyDecorator => {
  return multiInject(token as ServiceIdentifier<TValue>);
};
