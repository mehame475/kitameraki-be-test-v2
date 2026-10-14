import { app } from '@azure/functions';
import { getTaskService } from '../composition';
import { endpoint, json } from '../http/handler';

app.http('GetTasks', {
  methods: ['GET'],
  route: 'tasks',
  authLevel: 'function',
  handler: endpoint(async ({ organizationId }) => json(200, await getTaskService().list(organizationId))),
});
