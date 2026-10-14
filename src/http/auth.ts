import { AuthConfig } from '../config/env';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../errors';
import { isUuid } from '../validation/taskValidation';

export interface HeaderReader {
  get(name: string): string | null;
}

export interface Identity {
  /** Lower-cased UUID; doubles as the Cosmos partition key. */
  organizationId: string;
}

interface ClientPrincipal {
  claims?: { typ?: unknown; val?: unknown }[];
}

/** Resolves who is calling and which organization they act for. Throws an AppError otherwise. */
export function resolveIdentity(headers: HeaderReader, config: AuthConfig): Identity {
  return config.mode === 'header' ? fromHeader(headers) : fromEasyAuth(headers, config.orgClaimTypes);
}

function fromHeader(headers: HeaderReader): Identity {
  const value = headers.get('x-organization-id');
  if (!isUuid(value)) throw new ValidationError('Header "x-organization-id" must be a valid UUID');
  return { organizationId: value.toLowerCase() };
}

// App Service authentication validates the token and strips any client-sent copy of this header,
// so it can be trusted only when authentication is enabled on the Function App.
function fromEasyAuth(headers: HeaderReader, orgClaimTypes: string[]): Identity {
  const encoded = headers.get('x-ms-client-principal');
  if (!encoded) throw new UnauthorizedError();

  let principal: ClientPrincipal;
  try {
    principal = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as ClientPrincipal;
  } catch {
    throw new UnauthorizedError();
  }

  const claims = Array.isArray(principal?.claims) ? principal.claims : [];
  const claim = claims.find((c) => typeof c.typ === 'string' && orgClaimTypes.includes(c.typ));
  if (!claim || !isUuid(claim.val)) throw new ForbiddenError();
  return { organizationId: claim.val.toLowerCase() };
}
