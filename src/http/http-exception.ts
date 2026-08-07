export interface HttpRequestSource {
  readonly method?: string;
  readonly url?: string;
}

export interface HttpExceptionOptions {
  readonly cause?: unknown;
  readonly request?: HttpRequestSource;
}

const HTTP_EXCEPTION = Symbol.for('tiyn.app.http-exception');

export class HttpException<TResponse = unknown> extends Error {
  readonly [HTTP_EXCEPTION] = true;

  constructor(
    readonly response: TResponse,
    readonly status: number,
    options: HttpExceptionOptions = {},
  ) {
    super(resolveMessage(response, status), { cause: options.cause });
    this.name = new.target.name;
    this.request = options.request;
  }

  readonly request: HttpRequestSource | undefined;
}

export const isHttpException = (value: unknown): value is HttpException => {
  return (
    typeof value === 'object' &&
    value !== null &&
    Reflect.get(value, HTTP_EXCEPTION) === true &&
    typeof Reflect.get(value, 'status') === 'number'
  );
};

const resolveMessage = (response: unknown, status: number): string => {
  if (typeof response === 'object' && response !== null) {
    const title = Reflect.get(response, 'title');

    if (typeof title === 'string' && title.length > 0) {
      return title;
    }
  }

  if (typeof response === 'string' && response.length > 0) {
    return response;
  }

  return `HTTP request failed with status ${status}.`;
};

export class BadRequestException<TResponse = unknown> extends HttpException<TResponse> {
  constructor(response: TResponse, options?: HttpExceptionOptions) {
    super(response, 400, options);
  }
}
export class UnauthorizedException<TResponse = unknown> extends HttpException<TResponse> {
  constructor(response: TResponse, options?: HttpExceptionOptions) {
    super(response, 401, options);
  }
}
export class ForbiddenException<TResponse = unknown> extends HttpException<TResponse> {
  constructor(response: TResponse, options?: HttpExceptionOptions) {
    super(response, 403, options);
  }
}
export class NotFoundException<TResponse = unknown> extends HttpException<TResponse> {
  constructor(response: TResponse, options?: HttpExceptionOptions) {
    super(response, 404, options);
  }
}
export class MethodNotAllowedException<TResponse = unknown> extends HttpException<TResponse> {
  constructor(response: TResponse, options?: HttpExceptionOptions) {
    super(response, 405, options);
  }
}
export class RequestTimeoutException<TResponse = unknown> extends HttpException<TResponse> {
  constructor(response: TResponse, options?: HttpExceptionOptions) {
    super(response, 408, options);
  }
}
export class ConflictException<TResponse = unknown> extends HttpException<TResponse> {
  constructor(response: TResponse, options?: HttpExceptionOptions) {
    super(response, 409, options);
  }
}
export class UnprocessableEntityException<TResponse = unknown> extends HttpException<TResponse> {
  constructor(response: TResponse, options?: HttpExceptionOptions) {
    super(response, 422, options);
  }
}
export class LockoutException<TResponse = unknown> extends HttpException<TResponse> {
  constructor(response: TResponse, options?: HttpExceptionOptions) {
    super(response, 423, options);
  }
}
export class TooManyRequestsException<TResponse = unknown> extends HttpException<TResponse> {
  constructor(response: TResponse, options?: HttpExceptionOptions) {
    super(response, 429, options);
  }
}
export class InternalServerErrorException<TResponse = unknown> extends HttpException<TResponse> {
  constructor(response: TResponse, options?: HttpExceptionOptions) {
    super(response, 500, options);
  }
}
export class BadGatewayException<TResponse = unknown> extends HttpException<TResponse> {
  constructor(response: TResponse, options?: HttpExceptionOptions) {
    super(response, 502, options);
  }
}
export class ServiceUnavailableException<TResponse = unknown> extends HttpException<TResponse> {
  constructor(response: TResponse, options?: HttpExceptionOptions) {
    super(response, 503, options);
  }
}
export class GatewayTimeoutException<TResponse = unknown> extends HttpException<TResponse> {
  constructor(response: TResponse, options?: HttpExceptionOptions) {
    super(response, 504, options);
  }
}
