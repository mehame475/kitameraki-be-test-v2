import { app } from '@azure/functions';
import { getTaskService } from '../composition';
import { endpoint, noContent, requireTaskId } from '../http/handler';

app.http('DeleteTask', {
  methods: ['DELETE'],
  route: 'tasks/{id}',
  authLevel: 'function',
  handler: endpoint(async ({ request, organizationId }) => {
    await getTaskService().remove(organizationId, requireTaskId(request));
    return noContent();
  }),
});
