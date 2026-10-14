import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import { endpoint, json, publicEndpoint, readJsonBody } from '../src/http/handler';

const ORG = '11111111-1111-4111-8111-111111111111';

function makeRequest(over: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  const values = over.headers ?? {};
  return {
    method: over.method ?? 'GET',
    url: 'http://localhost:7071/api/tasks?secret=1',
    headers: { get: (name: string) => values[name.toLowerCase()] ?? null },
    params: {},
    text: async () => over.body ?? '',
  } as unknown as HttpRequest;
}

const logs: string[] = [];
const context = {
  invocationId: 'req-123',
  log: (message: string) => logs.push(message),
  error: () => undefined,
} as unknown as InvocationContext;

const echoOrg = endpoint(async ({ organizationId }) => json(200, { organizationId }));

beforeEach(() => {
  logs.length = 0;
  delete process.env.AUTH_MODE;
  process.env.AZURE_FUNCTIONS_ENVIRONMENT = 'Development';
});
afterEach(() => {
  delete process.env.AUTH_MODE;
  delete process.env.AZURE_FUNCTIONS_ENVIRONMENT;
});

describe('endpoint wrapper', () => {
  it('adds security headers and a request id to successful responses', async () => {
    process.env.AUTH_MODE = 'header';
    const res = await echoOrg(makeRequest({ headers: { 'x-organization-id': ORG.toUpperCase() } }), context);
    assert.equal(res.status, 200);
    assert.deepEqual(res.jsonBody, { organizationId: ORG });
    const headers = res.headers as Record<string, string>;
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Cache-Control'], 'no-store');
    assert.equal(headers['X-Request-Id'], 'req-123');
  });

  it('logs method, path and status but never the query string', async () => {
    process.env.AUTH_MODE = 'header';
    await echoOrg(makeRequest({ headers: { 'x-organization-id': ORG } }), context);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /^GET \/api\/tasks -> 200/);
    assert.equal(logs[0].includes('secret'), false);
  });

  it('is secure by default: no principal means 401, with the request id in the body', async () => {
    const res = await echoOrg(makeRequest({ headers: { 'x-organization-id': ORG } }), context);
    assert.equal(res.status, 401);
    const body = res.jsonBody as { error: { code: string; requestId: string } };
    assert.equal(body.error.code, 'unauthorized');
    assert.equal(body.error.requestId, 'req-123');
  });

  it('refuses header auth outside local development without leaking why', async () => {
    process.env.AUTH_MODE = 'header';
    process.env.AZURE_FUNCTIONS_ENVIRONMENT = 'Production';
    const res = await echoOrg(makeRequest({ headers: { 'x-organization-id': ORG } }), context);
    assert.equal(res.status, 500);
    assert.equal(JSON.stringify(res.jsonBody).includes('AUTH_MODE'), false);
  });

  it('turns unexpected errors into a generic 500', async () => {
    process.env.AUTH_MODE = 'header';
    const boom = endpoint(async () => {
      throw new Error('connection string: AccountKey=secret');
    });
    const res = await boom(makeRequest({ headers: { 'x-organization-id': ORG } }), context);
    assert.equal(res.status, 500);
    assert.equal(JSON.stringify(res.jsonBody).includes('AccountKey'), false);
  });
});

describe('publicEndpoint', () => {
  it('needs no identity but still adds the common headers', async () => {
    const res = await publicEndpoint(async () => json(200, { status: 'ok' }))(makeRequest(), context);
    assert.equal(res.status, 200);
    assert.equal((res.headers as Record<string, string>)['X-Content-Type-Options'], 'nosniff');
  });
});

describe('readJsonBody', () => {
  const post = (body: string, contentType = 'application/json; charset=utf-8') =>
    makeRequest({ method: 'POST', headers: { 'content-type': contentType }, body });

  it('parses JSON bodies', async () => {
    assert.deepEqual(await readJsonBody(post('{"a":1}')), { a: 1 });
  });

  it('rejects other content types with 415, invalid JSON with 400 and huge bodies with 413', async () => {
    await assert.rejects(readJsonBody(post('{}', 'text/plain')), (e: { status: number }) => e.status === 415);
    await assert.rejects(readJsonBody(post('{nope')), (e: { status: number }) => e.status === 400);
    await assert.rejects(readJsonBody(post('x'.repeat(300 * 1024))), (e: { status: number }) => e.status === 413);
  });
});
