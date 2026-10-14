import { app } from '@azure/functions';
import { getFormSettingsContainer, getTasksContainer } from '../infrastructure/cosmos';
import { json, publicEndpoint } from '../http/handler';

// Liveness: the process is up. Cheap, no dependencies.
app.http('Health', {
  methods: ['GET'],
  route: 'health',
  authLevel: 'anonymous',
  handler: publicEndpoint(async () => json(200, { status: 'ok' })),
});

// Readiness: Cosmos DB and both containers are reachable. Returns no internals.
app.http('HealthReady', {
  methods: ['GET'],
  route: 'health/ready',
  authLevel: 'anonymous',
  handler: publicEndpoint(async (_request, context) => {
    try {
      await Promise.all([getTasksContainer().read(), getFormSettingsContainer().read()]);
      return json(200, { status: 'ok' });
    } catch (error) {
      context.error('Readiness check failed', error);
      return json(503, { status: 'unavailable' });
    }
  }),
});
