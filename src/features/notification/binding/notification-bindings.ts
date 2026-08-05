import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';

import { NotificationServiceInterface } from '../contract/notification-service';
import {
  NotificationRuntime,
  NotificationRuntimeInterface,
  NotificationService,
} from '../runtime/notification-runtime';

export class NotificationBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(NotificationRuntimeInterface).to(NotificationRuntime).inSingletonScope();
    registry.bind(NotificationServiceInterface).to(NotificationService).inSingletonScope();
  }
}
