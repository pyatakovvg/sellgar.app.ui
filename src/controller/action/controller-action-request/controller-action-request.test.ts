import { describe, expect, it } from 'vitest';

import {
  CONTROLLER_ACTION_ERROR_FIELD,
  CONTROLLER_ACTION_KEY_FIELD,
  CONTROLLER_ACTION_PAYLOAD_FIELD,
  CONTROLLER_ACTION_SUBMIT_ID_FIELD,
  createControllerActionArgs,
  createControllerActionBody,
  createControllerActionErrorEnvelope,
  createControllerActionResultEnvelope,
  parseControllerActionRequest,
} from './controller-action-request.ts';

describe('controller action request', () => {
  it('creates and parses json controller action body', async () => {
    const request = new Request('https://example.test/action', {
      body: createControllerActionBody('controller:1', 'submit:1', {
        name: 'Ada',
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'post',
    });

    await expect(parseControllerActionRequest(request)).resolves.toEqual({
      controllerKey: 'controller:1',
      payload: {
        name: 'Ada',
      },
      submitId: 'submit:1',
    });
  });

  it('parses form controller action payload', async () => {
    const formData = new FormData();

    formData.set(CONTROLLER_ACTION_KEY_FIELD, 'controller:1');
    formData.set(CONTROLLER_ACTION_SUBMIT_ID_FIELD, 'submit:1');
    formData.set(CONTROLLER_ACTION_PAYLOAD_FIELD, JSON.stringify({ name: 'Ada' }));

    const request = new Request('https://example.test/action', {
      body: formData,
      method: 'post',
    });

    await expect(parseControllerActionRequest(request)).resolves.toEqual({
      controllerKey: 'controller:1',
      payload: {
        name: 'Ada',
      },
      submitId: 'submit:1',
    });
  });

  it('rejects invalid controller action key', async () => {
    const request = new Request('https://example.test/action', {
      body: JSON.stringify({
        [CONTROLLER_ACTION_PAYLOAD_FIELD]: {},
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'post',
    });

    await expect(parseControllerActionRequest(request)).rejects.toThrow('Ключ действия контроллера некорректен.');
  });

  it('creates controller action args', () => {
    const request = new Request('https://example.test/action');

    expect(createControllerActionArgs(request, { id: '42' }, { name: 'Ada' })).toEqual({
      params: {
        id: '42',
      },
      payload: {
        name: 'Ada',
      },
      request,
    });
  });

  it('wraps result only when submit id exists', () => {
    expect(createControllerActionResultEnvelope('submit:1', { ok: true })).toEqual({
      [CONTROLLER_ACTION_SUBMIT_ID_FIELD]: 'submit:1',
      data: {
        ok: true,
      },
    });

    expect(createControllerActionResultEnvelope(null, { ok: true })).toEqual({
      ok: true,
    });
  });

  it('wraps action error only when submit id exists', () => {
    const error = new Error('Action failed');

    expect(createControllerActionErrorEnvelope('submit:1', error)).toEqual({
      [CONTROLLER_ACTION_ERROR_FIELD]: error,
      [CONTROLLER_ACTION_SUBMIT_ID_FIELD]: 'submit:1',
    });

    expect(() => createControllerActionErrorEnvelope(null, error)).toThrow(error);
  });
});
