import type { LayoutConstructor } from '../../../layout/declaration/layout';
import type { Router } from '../../../router/declaration/router';
import type { ApplicationFeatureInterface } from '../../feature/application-feature';

import {
  ApplicationConfiguratorInterface,
  type ApplicationInitializerDeclaration,
  type ApplicationComponents,
  type ApplicationFrames,
  type ResolvedApplicationFrames,
} from '../application-configurator';

export class ApplicationConfig implements ApplicationConfiguratorInterface {
  private _components: ApplicationComponents = {};
  private _features: ApplicationFeatureInterface[] = [];
  private _frames: ApplicationFrames | null = null;
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

  get framesValue(): ResolvedApplicationFrames | null {
    if (this._frames === null) {
      return null;
    }

    return {
      exception: this._frames.exception ?? this._components.exception,
      fallback: this._frames.fallback ?? this._components.fallback,
      forbidden: this._frames.forbidden ?? this._components.forbidden,
      notFound: this._frames.notFound ?? this._components.notFound,
      shell: this._frames.shell,
    };
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

  frames(frames: ApplicationFrames): void {
    this._frames = frames;
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
