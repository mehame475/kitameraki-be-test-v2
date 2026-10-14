import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuthConfig } from '../src/config/env';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../src/errors';
import { resolveIdentity } from '../src/http/auth';

const ORG = '3F2B8C1E-9D4A-4E6B-8A7C-1D2E3F4A5B6C';
const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});
const principal = (claims: { typ: string; val: string }[]) =>
  Buffer.from(JSON.stringify({ auth_typ: 'aad', claims })).toString('base64');

const easyAuth: AuthConfig = { mode: 'easyauth', orgClaimTypes: ['tid'] };
const header: AuthConfig = { mode: 'header', orgClaimTypes: [] };

describe('resolveIdentity (easyauth)', () => {
  it('reads the organization from the validated principal and lower-cases it', () => {
    const h = headers({ 'x-ms-client-principal': principal([{ typ: 'tid', val: ORG }]) });
    assert.equal(resolveIdentity(h, easyAuth).organizationId, ORG.toLowerCase());
  });

  it('ignores the dev header: callers cannot choose their organization', () => {
    assert.throws(() => resolveIdentity(headers({ 'x-organization-id': ORG }), easyAuth), UnauthorizedError);
  });

  it('rejects missing or malformed principals with 401', () => {
    assert.throws(() => resolveIdentity(headers({}), easyAuth), UnauthorizedError);
    assert.throws(() => resolveIdentity(headers({ 'x-ms-client-principal': '%%%' }), easyAuth), UnauthorizedError);
    assert.throws(
      () => resolveIdentity(headers({ 'x-ms-client-principal': Buffer.from('not json').toString('base64') }), easyAuth),
      UnauthorizedError,
    );
  });

  it('rejects principals without a usable organization claim with 403', () => {
    const none = headers({ 'x-ms-client-principal': principal([{ typ: 'name', val: 'x' }]) });
    const bad = headers({ 'x-ms-client-principal': principal([{ typ: 'tid', val: 'not-a-uuid' }]) });
    assert.throws(() => resolveIdentity(none, easyAuth), ForbiddenError);
    assert.throws(() => resolveIdentity(bad, easyAuth), ForbiddenError);
  });
});

describe('resolveIdentity (header, local development)', () => {
  it('accepts a UUID header and rejects anything else', () => {
    assert.equal(resolveIdentity(headers({ 'x-organization-id': ORG }), header).organizationId, ORG.toLowerCase());
    assert.throws(() => resolveIdentity(headers({ 'x-organization-id': 'nope' }), header), ValidationError);
    assert.throws(() => resolveIdentity(headers({}), header), ValidationError);
  });
});
