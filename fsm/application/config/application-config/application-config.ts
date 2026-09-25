import { ApplicationConfig as CoreApplicationConfig } from '../../../../core/application/config/application-config';
import type { LayoutConstructor } from '../../../layout/declaration/layout';
import type { ApplicationComponents } from '../application-configurator';
import { ApplicationConfiguratorInterface } from '../application-configurator';

export class ApplicationConfig extends CoreApplicationConfig implements ApplicationConfiguratorInterface {
  private applicationComponents: ApplicationComponents = {};
  private applicationLayouts: readonly LayoutConstructor[] = [];

  get componentsValue(): ApplicationComponents {
    return this.applicationComponents;
  }

  get layoutsValue(): readonly LayoutConstructor[] {
    return this.applicationLayouts;
  }

  components(components: ApplicationComponents): void {
    this.applicationComponents = Object.freeze({ ...components });
  }

  layouts(layouts: readonly LayoutConstructor[]): void {
    this.applicationLayouts = Object.freeze([...layouts]);
  }
}
