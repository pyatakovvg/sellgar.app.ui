import type { ApplicationInitializerToken } from '../application-initializer';

export class ApplicationInitializerGroup {
  constructor(readonly initializers: readonly ApplicationInitializerToken[]) {}
}
