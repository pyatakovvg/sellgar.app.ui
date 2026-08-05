import { ApplicationInitializerGroup } from '../application-initializer-group';
import type { ApplicationInitializerToken } from '../application-initializer';

export abstract class Initializers {
  static parallel(initializers: readonly ApplicationInitializerToken[]): ApplicationInitializerGroup {
    return new ApplicationInitializerGroup(initializers);
  }
}
