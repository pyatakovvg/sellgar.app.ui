import type { ControllerActionArgs } from '../../contract/controller';

export const CONTROLLER_ACTION_KEY_FIELD = '__tiynAppController';
export const CONTROLLER_ACTION_SUBMIT_ID_FIELD = '__tiynAppSubmitId';
export const CONTROLLER_ACTION_PAYLOAD_FIELD = '__tiynAppPayload';
export const CONTROLLER_ACTION_ERROR_FIELD = '__tiynAppError';

export interface ControllerActionRequest {
  readonly controllerKey: string;
  readonly payload: unknown;
  readonly submitId: string | null;
}

export interface ControllerActionResultEnvelope {
  readonly [CONTROLLER_ACTION_SUBMIT_ID_FIELD]: string;
  readonly data: unknown;
}

export interface ControllerActionErrorEnvelope {
  readonly [CONTROLLER_ACTION_ERROR_FIELD]: unknown;
  readonly [CONTROLLER_ACTION_SUBMIT_ID_FIELD]: string;
}

export const createControllerActionBody = (controllerKey: string, submitId: string, payload: unknown): string => {
  return JSON.stringify({
    [CONTROLLER_ACTION_KEY_FIELD]: controllerKey,
    [CONTROLLER_ACTION_SUBMIT_ID_FIELD]: submitId,
    [CONTROLLER_ACTION_PAYLOAD_FIELD]: payload,
  });
};

export const parseControllerActionRequest = async (request: Request): Promise<ControllerActionRequest> => {
  const contentType = request.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await parseJsonPayload(request)
    : await parseFormPayload(request);

  return {
    controllerKey: parseControllerKey(payload[CONTROLLER_ACTION_KEY_FIELD]),
    payload: payload[CONTROLLER_ACTION_PAYLOAD_FIELD],
    submitId: parseSubmitId(payload[CONTROLLER_ACTION_SUBMIT_ID_FIELD]),
  };
};

export const createControllerActionArgs = (
  request: Request,
  params: Record<string, string | undefined>,
  payload: unknown,
): ControllerActionArgs => {
  return {
    params,
    payload,
    request,
  };
};

export const createControllerActionResultEnvelope = (
  submitId: string | null,
  data: unknown,
): ControllerActionResultEnvelope | unknown => {
  if (submitId === null) {
    return data;
  }

  return {
    [CONTROLLER_ACTION_SUBMIT_ID_FIELD]: submitId,
    data,
  };
};

export const createControllerActionErrorEnvelope = (
  submitId: string | null,
  error: unknown,
): ControllerActionErrorEnvelope | never => {
  if (submitId === null) {
    throw error;
  }

  return {
    [CONTROLLER_ACTION_ERROR_FIELD]: error,
    [CONTROLLER_ACTION_SUBMIT_ID_FIELD]: submitId,
  };
};

const parseJsonPayload = async (request: Request): Promise<Record<string, unknown>> => {
  const value = await request.clone().json();

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
};

const parseFormPayload = async (request: Request): Promise<Record<string, unknown>> => {
  const formData = await request.clone().formData();
  const payload: Record<string, unknown> = {};

  formData.forEach((value, key) => {
    payload[key] = parseFormValue(value);
  });

  return payload;
};

const parseFormValue = (value: FormDataEntryValue): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const parseControllerKey = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Ключ действия контроллера некорректен.');
  }

  return value;
};

const parseSubmitId = (value: unknown): string | null => {
  return typeof value === 'string' && value.length > 0 ? value : null;
};
