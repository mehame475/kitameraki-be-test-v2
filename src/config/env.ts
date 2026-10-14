export interface AppConfig {
  cosmosConnectionString: string;
  databaseId: string;
  containerId: string;
  settingsContainerId: string;
}

let cached: AppConfig | undefined;

/**
 * Reads configuration from environment variables (app settings in Azure,
 * local.settings.json locally). Evaluated lazily so a missing setting surfaces
 * as a logged 500 on the first request instead of crashing host start-up.
 * Secrets never live in source control.
 */
export function getConfig(): AppConfig {
  if (cached) return cached;

  const cosmosConnectionString = process.env.COSMOS_CONNECTION_STRING;
  if (!cosmosConnectionString) {
    throw new Error('Missing required app setting: COSMOS_CONNECTION_STRING');
  }

  cached = {
    cosmosConnectionString,
    databaseId: process.env.COSMOS_DATABASE || 'TaskApp',
    containerId: process.env.COSMOS_CONTAINER || 'Tasks',
    settingsContainerId: process.env.COSMOS_SETTINGS_CONTAINER || 'FormSettings',
  };
  return cached;
}

export type AuthMode = 'easyauth' | 'header';

export interface AuthConfig {
  mode: AuthMode;
  /** Claim types that may carry the organization id (first match wins). */
  orgClaimTypes: string[];
}

const DEFAULT_ORG_CLAIMS = ['tid', 'http://schemas.microsoft.com/identity/claims/tenantid'];

/**
 * How callers are identified.
 * - `easyauth` (default, fail-closed): App Service authentication / Entra ID validates the token and
 *   the platform forwards the identity in `x-ms-client-principal`.
 * - `header`: trusts a client-supplied `x-organization-id` header. Local development only; refused
 *   anywhere but the Functions Core Tools (AZURE_FUNCTIONS_ENVIRONMENT=Development).
 */
export function getAuthConfig(): AuthConfig {
  const mode = (process.env.AUTH_MODE || 'easyauth').toLowerCase();
  if (mode !== 'easyauth' && mode !== 'header') {
    throw new Error('AUTH_MODE must be "easyauth" or "header"');
  }
  if (mode === 'header' && process.env.AZURE_FUNCTIONS_ENVIRONMENT !== 'Development') {
    throw new Error('AUTH_MODE=header is only allowed for local development');
  }
  const claim = process.env.AUTH_ORG_CLAIM;
  return { mode, orgClaimTypes: claim ? [claim] : DEFAULT_ORG_CLAIMS };
}
