import type { DependencyToken } from '../../../di/token/dependency-token';
import type { RuntimeContextInterface } from '../../../runtime/context';
import type { DisposableRegistryInterface } from '../../disposable/disposable-registry';

export abstract class ApplicationInitializerInterface {
  abstract execute(context: ApplicationInitializerContextInterface): void | Promise<void>;
}

export interface ApplicationInitializerContextInterface extends RuntimeContextInterface {
  readonly disposables: DisposableRegistryInterface;
}

export type ApplicationInitializerToken = DependencyToken<ApplicationInitializerInterface>;
