import { Inject } from '../../../core/di/injection/decorators';
import { Provider, type ProviderInterface } from '../../../core/runtime/provider/provider';
import { ScreenServiceInterface } from './screen-service.interface.ts';

@Provider()
export class ScreenServiceProvider implements ProviderInterface {
  constructor(@Inject(ScreenServiceInterface) private readonly service: ScreenServiceInterface) {}

  dispose(): void {
    this.service.dispose();
  }
}
