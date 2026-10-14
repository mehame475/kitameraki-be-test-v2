import { app } from '@azure/functions';
import { getTaskService } from '../composition';
import { endpoint, json, readJsonBody } from '../http/handler';
import { parseIdList } from '../validation/taskValidation';

// POST (not DELETE) because DELETE request bodies are dropped by many clients and proxies.
app.http('BulkDeleteTasks', {
  methods: ['POST'],
  route: 'tasks/bulk-delete',
  authLevel: 'function',
  handler: endpoint(async ({ request, organizationId }) => {
    const ids = parseIdList(await readJsonBody(request));
    return json(200, await getTaskService().removeMany(organizationId, ids));
  }),
});
