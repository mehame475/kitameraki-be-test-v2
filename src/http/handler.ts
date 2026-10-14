import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getAuthConfig } from '../config/env';
import { AppError, UnsupportedMediaTypeError, ValidationError } from '../errors';
import { isUuid } from '../validation/taskValidation';
import { resolveIdentity } from './auth';

const MAX_BODY_BYTES = 256 * 1024;

/** Applied to every response, including errors. */
const COMMON_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export interface EndpointContext {
  request: HttpRequest;
  context: InvocationContext;
  organizationId: string;
}

export const json = (status: number, body: unknown): HttpResponseInit => ({ status, jsonBody: body });

export const noContent = (): HttpResponseInit => ({ status: 204 });

export function requireTaskId(request: HttpRequest): string {
  const id = request.params.id;
  if (!isUuid(id)) throw new ValidationError('Task id must be a valid UUID');
  return id.toLowerCase();
}

export async function readJsonBody(request: HttpRequest): Promise<unknown> {
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) {
    throw new UnsupportedMediaTypeError();
  }
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
    throw new AppError(413, 'payload_too_large', 'Request body is too large');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
}

function errorResponse(error: unknown, context: InvocationContext): HttpResponseInit {
  const requestId = context.invocationId;
  if (error instanceof AppError) {
    return json(error.status, {
      error: { code: error.code, message: error.message, details: error.details, requestId },
    });
  }
  // Details stay in the logs (correlated by requestId); clients only get a generic message.
  context.error(`Unhandled error (requestId ${requestId})`, error);
  return json(500, {
    error: { code: 'internal_error', message: 'Internal server error', requestId },
  });
}

/** Query strings are never logged: they may carry user data. */
const pathOf = (url: string) => url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '').split('?')[0];

async function run(
  request: HttpRequest,
  context: InvocationContext,
  work: () => Promise<HttpResponseInit>,
): Promise<HttpResponseInit> {
  const started = Date.now();
  let response: HttpResponseInit;
  try {
    response = await work();
  } catch (error) {
    response = errorResponse(error, context);
  }
  context.log(`${request.method} ${pathOf(request.url)} -> ${response.status ?? 200} (${Date.now() - started} ms)`);
  return {
    ...response,
    headers: {
      ...(response.headers as Record<string, string> | undefined),
      ...COMMON_HEADERS,
      'X-Request-Id': context.invocationId,
    },
  };
}

/** Authenticated endpoint: resolves the caller's organization, maps errors, adds common headers. */
export function endpoint(handler: (ctx: EndpointContext) => Promise<HttpResponseInit>) {
  return (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> =>
    run(request, context, async () => {
      const { organizationId } = resolveIdentity(request.headers, getAuthConfig());
      return handler({ request, context, organizationId });
    });
}

/** Endpoint without authentication (health probes only). Same error mapping and headers. */
export function publicEndpoint(
  handler: (request: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>,
) {
  return (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> =>
    run(request, context, () => handler(request, context));
}
