import { Equals } from 'class-validator';

import type { FsmModelConstructor } from '../fsm-token';

const PAYLOAD = Symbol('fsm:payload');

export const Payload =
  <TPayload extends object>(model: FsmModelConstructor<TPayload>) =>
  (target: { readonly payload: TPayload }, property: 'payload'): void => {
    if (property !== 'payload') throw new Error('@Payload должен описывать поле payload.');

    // Обычное поле класса содержит undefined. Данные snapshot не заполняют
    // эту декларацию: аргумент команды валидируется отдельно по model.
    Equals(undefined)(target, property);
    Reflect.defineMetadata(PAYLOAD, model, target.constructor);
  };

export const getFsmPayload = (command: FsmModelConstructor): FsmModelConstructor | undefined =>
  Reflect.getMetadata(PAYLOAD, command);
