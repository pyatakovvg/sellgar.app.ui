import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { Injectable } from '../../../di/injection/decorators';
import {
  RouterParamsConverterInterface,
  type RouterParamsConstructor,
  type RouterParamsObjectOptions,
} from '../router-params-converter';

@Injectable()
export class ClassTransformerRouterParamsConverter implements RouterParamsConverterInterface {
  toObject<TValue extends object>(
    target: RouterParamsConstructor<TValue>,
    params: Readonly<Record<string, unknown>>,
    options: RouterParamsObjectOptions = {},
  ): TValue {
    const result = plainToInstance(target, params, {
      enableImplicitConversion: options.enableTypeConversion ?? false,
      excludeExtraneousValues: true,
      exposeDefaultValues: false,
      exposeUnsetFields: false,
    });
    const errors = validateSync(result, {
      forbidUnknownValues: false,
      skipMissingProperties: true,
      skipNullProperties: true,
      skipUndefinedProperties: true,
      whitelist: true,
    });

    if (errors.length > 0) {
      throw errors;
    }

    return instanceToPlain(result, {
      excludeExtraneousValues: false,
      exposeDefaultValues: true,
      exposeUnsetFields: false,
      strategy: 'excludeAll',
    }) as TValue;
  }
}
