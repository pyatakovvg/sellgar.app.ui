import type { LayoutConstructor } from '../../../layout/declaration/layout';
import type { Router } from '../../../router/declaration/router';
import type { ApplicationFeatureInterface } from '../../feature/application-feature';

import {
  ApplicationConfiguratorInterface,
  type ApplicationInitializerDeclaration,
  type ApplicationComponents,
} from '../application-configurator';

export class ApplicationConfig extends ApplicationConfiguratorInterface {
  private _components: ApplicationComponents = {};
  private _features: ApplicationFeatureInterface[] = [];
  private _initializers: ApplicationInitializerDeclaration[] = [];
  private _layouts: LayoutConstructor[] = [];
  private _router: Router | null = null;

  get componentsValue(): ApplicationComponents {
    return this._components;
  }

  get initializersValue(): readonly ApplicationInitializerDeclaration[] {
    return this._initializers;
  }

  get featuresValue(): readonly ApplicationFeatureInterface[] {
    return this._features;
  }

  get layoutsValue(): LayoutConstructor[] {
    return this._layouts;
  }

  get routerValue(): Router {
    if (this._router === null) {
      throw new Error('Роутер приложения не настроен.');
    }

    return this._router;
  }

  components(components: ApplicationComponents): void {
    this._components = components;
  }

  features(features: readonly ApplicationFeatureInterface[]): void {
    this._features = [...features];
  }

  initializers(initializers: readonly ApplicationInitializerDeclaration[]): void {
    this._initializers = [...initializers];
  }

  layouts(layouts: LayoutConstructor[]): void {
    this._layouts = layouts;
  }

  router(router: Router): void {
    this._router = router;
  }
}
