import { app } from '@azure/functions';
import { getTaskService } from '../composition';
import { endpoint, json, requireTaskId } from '../http/handler';

app.http('GetTask', {
  methods: ['GET'],
  route: 'tasks/{id}',
  authLevel: 'function',
  handler: endpoint(async ({ request, organizationId }) =>
    json(200, await getTaskService().get(organizationId, requireTaskId(request))),
  ),
});
