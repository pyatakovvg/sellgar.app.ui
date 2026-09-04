import { ApplicationConfig as CoreApplicationConfig } from '../../../../core/application/config/application-config';
import type { LayoutConstructor } from '../../../layout/declaration/layout';
import type {
  ApplicationComponents,
  ApplicationRouting,
  ResolvedApplicationRouting,
} from '../application-configurator';
import { ApplicationConfiguratorInterface } from '../application-configurator';

export class ApplicationConfig extends CoreApplicationConfig implements ApplicationConfiguratorInterface {
  private applicationComponents: ApplicationComponents = {};
  private applicationLayouts: readonly LayoutConstructor[] = [];
  private applicationRouting: ApplicationRouting | null = null;

  get componentsValue(): ApplicationComponents {
    return this.applicationComponents;
  }

  get layoutsValue(): readonly LayoutConstructor[] {
    return this.applicationLayouts;
  }

  get routingValue(): ResolvedApplicationRouting | null {
    if (this.applicationRouting === null) {
      return null;
    }

    return Object.freeze({
      exception: this.applicationRouting.exception ?? this.applicationComponents.exception,
      fallback: this.applicationRouting.fallback ?? this.applicationComponents.fallback,
      forbidden: this.applicationRouting.forbidden ?? this.applicationComponents.forbidden,
      notFound: this.applicationRouting.notFound ?? this.applicationComponents.notFound,
      ...(this.applicationRouting.shell ? { shell: this.applicationRouting.shell } : {}),
    });
  }

  components(components: ApplicationComponents): void {
    this.applicationComponents = Object.freeze({ ...components });
  }

  layouts(layouts: readonly LayoutConstructor[]): void {
    this.applicationLayouts = Object.freeze([...layouts]);
  }

  routing(routing: ApplicationRouting): void {
    this.applicationRouting = Object.freeze({ ...routing });
  }
}
