import type { Router } from '../../../router/declaration/router';
import type { ApplicationFeatureToken } from '../../feature/application-feature';
import { ApplicationConfiguratorInterface, type ApplicationInitializerDeclaration } from '../application-configurator';

export class ApplicationConfig extends ApplicationConfiguratorInterface {
  private featuresList: ApplicationFeatureToken[] = [];
  private initializersList: ApplicationInitializerDeclaration[] = [];
  private routerDeclaration: Router | null = null;

  get featuresValue(): readonly ApplicationFeatureToken[] {
    return this.featuresList;
  }

  get initializersValue(): readonly ApplicationInitializerDeclaration[] {
    return this.initializersList;
  }

  get routerValue(): Router {
    if (!this.routerDeclaration) {
      throw new Error('Роутер приложения не настроен.');
    }

    return this.routerDeclaration;
  }

  features(features: readonly ApplicationFeatureToken[]): void {
    this.featuresList = [...features];
  }

  initializers(initializers: readonly ApplicationInitializerDeclaration[]): void {
    this.initializersList = [...initializers];
  }

  router(router: Router): void {
    this.routerDeclaration = router;
  }
}
