import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import type { FsmModelConstructor } from '../../declaration/fsm-token';

export const materializeFsmModel = async <TValue extends object>(
  model: FsmModelConstructor<TValue>,
  value: unknown,
): Promise<TValue> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('FSM ожидает объект state или command payload.');
  }
  const instance = plainToInstance(model, value, { enableImplicitConversion: false });
  await validateOrReject(instance, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: false });
  return instance;
};
